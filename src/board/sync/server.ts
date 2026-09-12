import { migrateTaskDates, taskDateMigrationKey } from "~/board/data/date-migration";
import { calendarClient } from "~/google/api";
import { getGoogleCalendarAccount, getGoogleCalendarToken } from "~/google/access";
import { calendarError } from "~/google/schema";
import { CalendarStore } from "~/google/store";
import { GoogleCalendarSync } from "~/google/sync";
import { applyTaskLinks, type TaskLinkUpdate } from "./enrichment/apply";
import {
  getCompletedGithubTasks,
  disconnectDeletedGithubLanes,
  insertGithubTasks,
} from "~/github/board-changes";
import { BoardMutationWriter } from "./mutations/writer";
import { BoardStore } from "./store";
import { normalizeBoardCollections } from "./mutations/normalize";
import type { PreparedMutation } from "./mutations/schema";
import { AttachmentStore } from "~/board/attachments/store";
import { UploadInput } from "~/board/attachments/schema";
import {
  annotateOperation,
  captureTelemetryContext,
  observeBackground,
  observeInvocation,
} from "~/telemetry/runtime";
import type { TelemetryContext } from "~/telemetry/schema";
import { isE2EEnabled } from "~/auth/e2e-guard";
import { createDemoSeed } from "~/board/seeds/demo";
import { createOnboardingSeed } from "~/board/seeds/onboarding";
import { BoardSeedError, SeedOptions } from "~/board/seeds/schema";
import { env } from "~/env";
import { GitHubBoard } from "~/github/board";
import { GitHubError, GitHubSettings, fromGithubPromise, toGithubError } from "~/github/schema";
import { BillingActionError } from "~/billing/config";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { canWrite } from "~/billing/access";
import { readBillingAccess } from "~/billing/store";
import { billingOperation, type BillingAction } from "~/billing/provider";
import { processCustomerEvent } from "~/billing/webhook";
import { CommandJournal } from "~/mcp/journal";
import { BoardTools, callBoardTool } from "~/mcp/board-tools";
import { type ToolReply, type ToolName } from "~/mcp/schema";
import { type PendingMutation } from "@tanstack/db";
import { DateTime, Effect, Schema } from "effect";

import { enrichTaskLinks, getTasksNeedingLinks } from "./enrichment/resolve";
import { linkPreviewRuntime } from "~/board/links/runtime";
import { taskCollectionId } from "~/board/sync/collections";
import { isSystemLane } from "~/board/views";
import { SyncDurableObject } from "~/sync/durable-object";
import type { SyncSnapshot } from "~/sync/durable-object";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import { runGithub, serverRuntime } from "~/server/runtime";

export class BoardObject extends SyncDurableObject<Env> {
  #invoke<A>(
    operation: string,
    userId: string,
    work: () => Promise<A>,
    telemetry?: TelemetryContext,
  ): Promise<A> {
    return observeInvocation(
      this.env,
      (promise) => this.ctx.waitUntil(promise),
      `BoardObject.${operation}`,
      async () => {
        await this.bindOwner(userId);
        return work();
      },
      telemetry,
      { component: "board", category: "domain", accountId: userId },
    );
  }

  #board: BoardStore = new BoardStore(
    this.ctx.storage,
    (mutations) => this.#afterPersist(mutations),
    () => this.broadcastSyncSnapshot(),
  );

  #afterPersist = Effect.fn("BoardObject.afterPersist")(function* (
    this: BoardObject,
    mutations: ReadonlyArray<PendingMutation>,
  ) {
    this.#enqueueCalendarSync(mutations);
    yield* this.#attachments
      .reconcileUploads()
      .pipe(Effect.catch(() => Effect.logWarning("Attachment cleanup will retry.")));
    yield* this.#syncGithubChanges(mutations).pipe(
      Effect.mapError((error) => new SyncProtocolError({ message: error.message })),
    );
  });

  protected override readSyncSnapshot(): Promise<ReadonlyArray<SyncSnapshot>> {
    return this.#board.readSnapshot();
  }

  #attachments: AttachmentStore = new AttachmentStore(
    this.ctx.storage,
    this.env.ATTACHMENTS,
    this.ctx.id.toString(),
    (id) => this.#board.tasks.get(id),
  );

  async reserveUpload(userId: string, input: UploadInput) {
    await this.bindOwner(userId);
    return this.serialized(async () => {
      if (!(await this.canMutate())) {
        throw new Error("Update your subscription to upload files.");
      }
      return serverRuntime.runPromise(
        Schema.decodeUnknownEffect(UploadInput)(input).pipe(
          Effect.flatMap((value) => this.#attachments.reserveUpload(value)),
        ),
      );
    });
  }

  async getUpload(userId: string, id: string, write = false) {
    await this.bindOwner(userId);
    return this.serialized(async () => {
      if (write && !(await this.canMutate())) {
        throw new Error("Update your subscription to upload files.");
      }
      return serverRuntime.runPromise(this.#attachments.getUpload(id));
    });
  }

  async finishUpload(userId: string, id: string) {
    await this.bindOwner(userId);
    return this.serialized(async () => {
      if (!(await this.canMutate())) {
        throw new Error("Update your subscription to upload files.");
      }
      return serverRuntime.runPromise(this.#attachments.finishUpload(id));
    });
  }

  async cancelUpload(userId: string, id: string) {
    await this.bindOwner(userId);
    return this.serialized(() => serverRuntime.runPromise(this.#attachments.cancelUpload(id)));
  }

  override async alarm() {
    await this.serialized(() => serverRuntime.runPromise(this.#attachments.reconcileUploads()));
  }

  #calendar = new GoogleCalendarSync({
    store: new CalendarStore(this.ctx.storage),
    client: calendarClient,
    getAccount: getGoogleCalendarAccount,
    getToken: getGoogleCalendarToken,
    readBoard: () =>
      Effect.tryPromise({
        try: () =>
          this.serialized(async () => ({
            tasks: this.#board.tasks.toArray,
            lanes: this.#board.lanes.toArray,
          })),
        catch: () => calendarError("Could not read tasks for Calendar sync."),
      }),
    datesMigrated: () =>
      Effect.tryPromise({
        try: async () => !!(await this.ctx.storage.get<boolean>(taskDateMigrationKey)),
        catch: () => calendarError("Could not read due date migration status."),
      }),
  });

  #enqueueCalendarSync(mutations: ReadonlyArray<PendingMutation>) {
    if (!mutations.some((mutation) => ["tasks", "lanes"].includes(mutation.collection.id))) {
      return;
    }
    this.ctx.waitUntil(
      observeBackground("google.reconcileCalendar", async () => {
        const userId = await this.ctx.storage.get<string>("billing:owner");
        if (userId) {
          await serverRuntime.runPromise(this.#calendar.reconcile(userId));
        }
      }),
    );
  }

  async migrateDueDates(userId: string, referenceDate: string, telemetry?: TelemetryContext) {
    return this.#invoke(
      "migrateDueDates",
      userId,
      () =>
        this.serialized(async () => {
          const changed = await serverRuntime.runPromise(
            migrateTaskDates(this.ctx.storage, this.#board, referenceDate),
          );
          if (changed) {
            await this.broadcastSyncSnapshot();
          }
        }),
      telemetry,
    );
  }

  async getGoogleCalendarStatus(userId: string, telemetry?: TelemetryContext) {
    return this.#invoke(
      "getGoogleCalendarStatus",
      userId,
      async () => {
        const status = await serverRuntime.runPromise(this.#calendar.getStatus());
        this.ctx.waitUntil(
          observeBackground("google.reconcileCalendar", () =>
            serverRuntime.runPromise(this.#calendar.reconcile(userId)),
          ),
        );
        return status;
      },
      telemetry,
    );
  }

  async setGoogleCalendarEnabled(userId: string, enabled: boolean, telemetry?: TelemetryContext) {
    return this.#invoke(
      "setGoogleCalendarEnabled",
      userId,
      () => serverRuntime.runPromise(this.#calendar.setEnabled(userId, enabled)),
      telemetry,
    );
  }

  #github: GitHubBoard = new GitHubBoard({
    storage: this.ctx.storage,
    database: this.env.DB,
    serialized: (work) =>
      fromGithubPromise(() => this.serialized(() => serverRuntime.runPromise(work))),
    tasks: () => this.#board.tasks.toArray,
    laneExists: (id) => !isSystemLane({ id }) && this.#board.lanes.has(id),
    canWrite: () => this.canMutate(),
    insert: (tasks) =>
      serverRuntime.runPromise(
        this.#board.persist(() => insertGithubTasks(this.#board, tasks), "github_import"),
      ),
    broadcast: () => this.broadcastSyncSnapshot(),
  });

  async getGithubStatus(userId: string, laneId: string, telemetry?: TelemetryContext) {
    return this.#invoke(
      "getGithubStatus",
      userId,
      async () => {
        return this.serialized(() => runGithub(this.#github.getLaneConnection(laneId)));
      },
      telemetry,
    );
  }

  async saveGithubSettings(userId: string, input: GitHubSettings, telemetry?: TelemetryContext) {
    return this.#invoke(
      "saveGithubSettings",
      userId,
      async () => {
        return runGithub(
          Schema.decodeUnknownEffect(GitHubSettings)(input).pipe(
            Effect.mapError(toGithubError),
            Effect.flatMap((settings) => this.#github.saveSettings(settings)),
          ),
        );
      },
      telemetry,
    );
  }

  async disconnectGithubLane(userId: string, laneId: string, telemetry?: TelemetryContext) {
    return this.#invoke(
      "disconnectGithubLane",
      userId,
      async () => {
        return this.serialized(() => runGithub(this.#github.disconnectLane(laneId)));
      },
      telemetry,
    );
  }

  async syncGithubNow(userId: string, laneId: string, telemetry?: TelemetryContext) {
    return this.#invoke(
      "syncGithubNow",
      userId,
      async () => {
        return runGithub(this.#github.syncLane(laneId));
      },
      telemetry,
    );
  }

  async importGithubIssues(
    userId: string,
    connectionId: string,
    issueNumber?: number,
    telemetry?: TelemetryContext,
  ) {
    return this.#invoke(
      "importGithubIssues",
      userId,
      async () => {
        return runGithub(this.#github.importIssues(connectionId, issueNumber));
      },
      telemetry,
    );
  }

  protected override isSyncOwner(userId: string) {
    return this.env.BOARD.idFromName(userId).toString() === this.ctx.id.toString();
  }

  async bindOwner(userId: string) {
    if (this.env.BOARD.idFromName(userId).toString() !== this.ctx.id.toString()) {
      throw new Error("Board account mismatch.");
    }
    annotateOperation({ accountId: userId, boardId: this.ctx.id.toString() });
    await this.ctx.storage.put("billing:owner", userId);
  }

  async seedOnboarding(userId: string, telemetry?: TelemetryContext) {
    return this.#invoke(
      "seedOnboarding",
      userId,
      async () => {
        return this.serialized(() =>
          serverRuntime.runPromise(this.#board.seedBoard(createOnboardingSeed())),
        );
      },
      telemetry,
    );
  }

  async seedE2E(userId: string, options: SeedOptions, requestUrl: string, secret: string | null) {
    if (!isE2EEnabled(env, requestUrl, secret)) {
      throw new BoardSeedError({ message: "E2E board seeding is disabled." });
    }
    await this.bindOwner(userId);
    const input = Schema.decodeUnknownSync(SeedOptions)(options);
    if (input.seed === undefined || input.seed === "empty") {
      return false;
    }
    const seed =
      input.seed === "onboarding"
        ? createOnboardingSeed()
        : createDemoSeed({
            anchorDate: input.anchorDate ?? DateTime.formatIsoDateUtc(DateTime.nowUnsafe()),
          });
    return this.serialized(() => serverRuntime.runPromise(this.#board.seedBoard(seed)));
  }

  async billing(userId: string, action: BillingAction, telemetry?: TelemetryContext) {
    return this.#invoke(
      "billing",
      userId,
      async () => {
        try {
          return await this.serialized(() => billingOperation(this.env.DB, userId, action));
        } catch (error) {
          annotateOperation({
            outcome:
              error instanceof BillingActionError ? "expected_rejection" : "unexpected_failure",
            status: error instanceof PolarError ? error.statusCode : undefined,
          });
          // SDK errors can include authorization headers and checkout secrets. Do not serialize their causes over RPC.
          // oxlint-disable-next-line eslint/preserve-caught-error
          throw new Error(
            error instanceof BillingActionError
              ? error.message
              : "Billing is temporarily unavailable. Please try again.",
          );
        }
      },
      telemetry,
    );
  }

  async processBillingEvent(userId: string, body: string, telemetry?: TelemetryContext) {
    return this.#invoke(
      "processBillingEvent",
      userId,
      async () => {
        return this.serialized(() => processCustomerEvent(this.env.DB, userId, body));
      },
      telemetry,
    );
  }

  protected override async canMutate() {
    if (env.BILLING_ENFORCEMENT_ENABLED !== "true") {
      return true;
    }
    const userId = await this.ctx.storage.get<string>("billing:owner");
    return userId !== undefined && canWrite(await readBillingAccess(this.env.DB, userId));
  }

  #writer = new BoardMutationWriter(
    this.#board,
    (mutate, operation, transactionId) => this.#board.persist(mutate, operation, transactionId),
    (task) => this.#attachments.validateAttachments(task),
  );

  #journal = new CommandJournal<ReadonlyArray<PreparedMutation>>(
    this.ctx.storage,
    (entry) => serverRuntime.runPromise(this.#writer.applyCommand(entry)),
    () => this.broadcastSyncSnapshot(),
  );

  #tools = new BoardTools({
    getState: () => ({
      lanes: this.#board.lanes.toArray,
      tasks: this.#board.tasks.toArray,
      revision: this.#board.revision,
    }),
    canMutate: () => this.canMutate(),
    journal: this.#journal,
    prepareMutations: (mutations) => this.#writer.prepare(mutations),
    enrichTasks: (mutations, operationId) => this.#enqueueLinkEnrichment(mutations, operationId),
  });

  protected override recoverPendingWork(): Promise<void> {
    return this.#journal.recover();
  }

  async callTool(
    clientId: string,
    name: ToolName,
    raw: unknown,
    telemetry?: TelemetryContext,
  ): Promise<ToolReply> {
    return observeInvocation(
      this.env,
      (promise) => this.ctx.waitUntil(promise),
      "BoardObject.callTool",
      () =>
        serverRuntime.runPromise(
          callBoardTool(name, () =>
            this.serialized(() =>
              serverRuntime.runPromise(this.#tools.executeTool(clientId, name, raw)),
            ),
          ),
        ),
      telemetry,
      { component: "mcp", category: "domain" },
    );
  }

  protected override async initializeSync() {
    await this.#board.preload();
    await serverRuntime.runPromise(this.#board.runMigrations());
    await this.#journal.recover();
    await serverRuntime.runPromise(
      this.#board.persist(() => normalizeBoardCollections(this.#board), "initialize"),
    );
    this.#enqueueLinkEnrichment(
      this.#board.tasks.toArray.map(
        (task) =>
          new Mutation({ collection: taskCollectionId, type: "update", key: task.id, value: task }),
      ),
      "initialize",
    );
  }

  protected override async commitSyncMutations(
    mutations: ReadonlyArray<Mutation>,
    transactionId: string,
  ): Promise<ReadonlyArray<Mutation>> {
    const outgoing = await serverRuntime.runPromise(
      this.#writer.commitMutations(mutations, transactionId),
    );
    this.#enqueueLinkEnrichment(mutations, transactionId);
    return outgoing;
  }

  #syncGithubChanges = Effect.fn("BoardObject.syncGithubChanges")(function* (
    this: BoardObject,
    mutations: ReadonlyArray<PendingMutation>,
  ): Effect.fn.Return<void, GitHubError> {
    const completed = getCompletedGithubTasks(mutations, (id) => this.#board.tasks.get(id));
    if (completed.length > 0) {
      // Start after the write; GitHub failures do not roll back local completion.
      this.ctx.waitUntil(
        observeBackground("github.closeCompletedIssues", () =>
          serverRuntime.runPromise(
            this.#github
              .closeCompletedIssues(completed)
              .pipe(
                Effect.catch((error) =>
                  Effect.logWarning("github.closure_failed", { message: error.message }),
                ),
              ),
          ),
        ),
      );
    }
    yield* disconnectDeletedGithubLanes(mutations, this.#github);
  });

  #enqueueLinkEnrichment(mutations: ReadonlyArray<Mutation>, transactionId: string) {
    const getTask = (id: string) => this.#board.tasks.get(id);
    const taskIds = getTasksNeedingLinks(mutations, getTask);
    if (taskIds.length === 0) {
      return;
    }
    this.ctx.waitUntil(
      observeBackground("board.enrichTaskLinks", () =>
        linkPreviewRuntime.runPromise(
          enrichTaskLinks(
            taskIds,
            getTask,
            (updates) =>
              Effect.tryPromise({
                try: () =>
                  this.serialized(() => serverRuntime.runPromise(this.#commitTaskLinks(updates))),
                catch: (cause) => new SyncProtocolError({ message: String(cause) }),
              }),
            transactionId,
          ),
        ),
      ),
    );
  }

  #commitTaskLinks = Effect.fn("BoardObject.commitTaskLinks")(function* (
    this: BoardObject,
    updates: ReadonlyArray<TaskLinkUpdate>,
  ) {
    let outgoing: Mutation[] = [];
    yield* this.#board.persist(() => {
      outgoing = applyTaskLinks(this.#board.tasks, updates);
    }, "server_enrichment");
    yield* this.broadcastSyncMutations(outgoing);
    return outgoing.length;
  });
}

export async function handleBoardRequest(
  request: Request,
  bindings: Env,
  id: string,
): Promise<Response> {
  const board = bindings.BOARD.get(bindings.BOARD.idFromName(id));
  await board.bindOwner(id);
  const headers = new Headers(request.headers);
  const telemetry = captureTelemetryContext();
  if (telemetry) {
    headers.set("traceparent", telemetry.traceparent);
    headers.set("x-sidequest-operation-id", telemetry.operationId);
  }
  return board.fetch(new Request(request, { headers }));
}
