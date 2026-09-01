import { createCloudflareDOSQLitePersistence } from "@tanstack/cloudflare-durable-objects-db-sqlite-persistence";
import { createTransaction } from "@tanstack/db";
import { Effect } from "effect";

import { attachmentsForTitle } from "~/board/links/enrich";
import { titleMayContainHttpUrl } from "~/board/links/extract";
import { linkPreviewRuntime } from "~/board/links/runtime";
import { decodeLane, decodeTask } from "~/board/sync/codec";
import {
  createLaneCollection,
  createTaskCollection,
  laneCollectionId,
  taskCollectionId,
} from "~/board/sync/collections";
import { Lane, Task } from "~/board/schema";
import {
  enforcedDescendantCompletions,
  isSystemLane,
  normalizeStoredBoard,
  normalizeTask,
  rehomeTasksForDeletedLane,
  tasksInLane,
} from "~/board/views";
import { SyncDurableObject } from "~/sync/durable-object";
import type { SyncSnapshot } from "~/sync/durable-object";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import { serverRuntime } from "~/server/runtime";

const optionalTaskKeys = [
  "laneId",
  "parentId",
  "date",
  "attachments",
] as const satisfies ReadonlyArray<keyof Task>;

type PreparedMutation =
  | { collection: typeof laneCollectionId; mutation: Mutation; value?: Lane }
  | { collection: typeof taskCollectionId; mutation: Mutation; value?: Task };

function mutationTelemetry(mutations: ReadonlyArray<Mutation>) {
  return {
    collections: [...new Set(mutations.map((mutation) => mutation.collection))]
      .toSorted()
      .join(","),
    mutationCount: mutations.length,
    mutationTypes: [...new Set(mutations.map((mutation) => mutation.type))].toSorted().join(","),
  };
}

function logBoardSync(event: string, annotations: Record<string, string | number | boolean> = {}) {
  return Effect.logInfo("sync.lifecycle").pipe(
    Effect.annotateLogs({ component: "sync-server", event, ...annotations }),
  );
}

function replaceTask(draft: Task, next: Task) {
  const preservedAttachments = draft.attachments;
  for (const key of optionalTaskKeys) {
    if (next[key] === undefined) {
      delete draft[key];
    }
  }

  Object.assign(draft, next);
  if (next.attachments === undefined && preservedAttachments !== undefined) {
    Object.assign(draft, { attachments: [...preservedAttachments] });
  }
}

export class BoardObject extends SyncDurableObject<Env> {
  persistence = createCloudflareDOSQLitePersistence({
    storage: this.ctx.storage,
  });

  lanes = createLaneCollection(this.persistence);

  tasks = createTaskCollection(this.persistence);

  protected override async initializeSync() {
    await Promise.all([this.lanes.preload(), this.tasks.preload()]);
    await serverRuntime.runPromise(
      this.#persist(() => {
        normalizeStoredBoard({ lanes: this.lanes, tasks: this.tasks });
      }, "initialize"),
    );
  }

  protected override async readSyncSnapshot(): Promise<ReadonlyArray<SyncSnapshot>> {
    await Promise.all([this.lanes.preload(), this.tasks.preload()]);
    return [
      { collection: laneCollectionId, values: this.lanes.toArray },
      { collection: taskCollectionId, values: this.tasks.toArray },
    ];
  }

  protected override commitSyncMutations(
    mutations: ReadonlyArray<Mutation>,
    transactionId: string,
  ): Promise<ReadonlyArray<Mutation>> {
    return serverRuntime.runPromise(this.#commitMutations(mutations, transactionId));
  }

  #persist = Effect.fn("BoardObject.persist")(function* (
    this: BoardObject,
    mutate: () => void,
    operation: string,
    transactionId?: string,
  ) {
    const startedAt = Date.now();
    yield* Effect.annotateCurrentSpan({
      operation,
      ...(transactionId === undefined ? {} : { transactionId }),
    });
    yield* Effect.tryPromise({
      try: async () => {
        const transaction = createTransaction({
          autoCommit: false,
          mutationFn: async ({ transaction: pending }) => {
            await Promise.all([
              this.lanes.utils.acceptMutations(pending),
              this.tasks.utils.acceptMutations(pending),
            ]);
          },
        });
        transaction.mutate(mutate);
        await transaction.commit();
      },
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });
    yield* logBoardSync("persistence_committed", {
      durationMs: Date.now() - startedAt,
      operation,
      outcome: "success",
      ...(transactionId === undefined ? {} : { transactionId }),
    });
  });

  #commitMutations = Effect.fn("BoardObject.commitMutations")(function* (
    this: BoardObject,
    incoming: ReadonlyArray<Mutation>,
    transactionId: string,
  ) {
    const startedAt = Date.now();
    yield* Effect.annotateCurrentSpan({ transactionId, ...mutationTelemetry(incoming) });
    const prepared = yield* this.#prepareMutations(incoming);
    const applied = prepared.map(({ mutation }) => mutation);
    let outgoing: Mutation[] = [];
    yield* this.#persist(
      () => {
        for (const mutation of prepared) {
          this.#applyMutation(mutation);
        }
        outgoing = [
          ...applied,
          ...this.#enforcedCompletionMutations(applied),
          ...this.#enforcedOrphanRehomeMutations(applied),
        ];
      },
      "client_mutation",
      transactionId,
    );
    yield* logBoardSync("collection_application", {
      durationMs: Date.now() - startedAt,
      outcome: "success",
      transactionId,
      ...mutationTelemetry(outgoing),
    });
    this.#enqueueLinkEnrichment(applied, transactionId);
    return outgoing;
  });

  #prepareMutations = Effect.fn("BoardObject.prepareMutations")(function* (
    this: BoardObject,
    mutations: ReadonlyArray<Mutation>,
  ) {
    const startedAt = Date.now();
    yield* Effect.annotateCurrentSpan(mutationTelemetry(mutations));
    const applied: PreparedMutation[] = [];
    for (const mutation of mutations) {
      applied.push(yield* this.#prepareMutation(mutation));
    }
    yield* logBoardSync("mutations_prepared", {
      durationMs: Date.now() - startedAt,
      outcome: "success",
      ...mutationTelemetry(mutations),
    });
    return applied;
  });

  #prepareMutation = Effect.fn("BoardObject.prepareMutation")(function* (
    this: BoardObject,
    mutation: Mutation,
  ) {
    if (mutation.collection === laneCollectionId) {
      if (mutation.type === "delete") {
        if (isSystemLane({ id: mutation.key })) {
          return yield* new SyncProtocolError({ message: "System lanes cannot be persisted" });
        }

        return { collection: laneCollectionId, mutation } satisfies PreparedMutation;
      }

      if (mutation.value === undefined) {
        // oxlint-disable-next-line typescript/consistent-return -- typed Effect failure
        return yield* new SyncProtocolError({ message: `Missing value for ${mutation.type}` });
      }

      const lane = yield* decodeLane(mutation.value);
      if (lane.id !== mutation.key) {
        return yield* new SyncProtocolError({
          message: "Lane mutation key does not match value",
        });
      }
      if (isSystemLane(lane)) {
        return yield* new SyncProtocolError({ message: "System lanes cannot be persisted" });
      }

      return {
        collection: laneCollectionId,
        mutation: new Mutation({
          collection: mutation.collection,
          type: mutation.type,
          key: mutation.key,
          value: lane,
        }),
        value: lane,
      } satisfies PreparedMutation;
    }

    if (mutation.collection !== taskCollectionId) {
      return yield* new SyncProtocolError({
        message: `Unknown board collection ${mutation.collection}`,
      });
    }

    if (mutation.type === "delete") {
      return { collection: taskCollectionId, mutation } satisfies PreparedMutation;
    }

    if (mutation.value === undefined) {
      // oxlint-disable-next-line typescript/consistent-return -- typed Effect failure
      return yield* new SyncProtocolError({ message: `Missing value for ${mutation.type}` });
    }

    const task = normalizeTask(yield* decodeTask(mutation.value));
    if (task.id !== mutation.key) {
      return yield* new SyncProtocolError({ message: "Task mutation key does not match value" });
    }
    return {
      collection: taskCollectionId,
      mutation: new Mutation({
        collection: mutation.collection,
        type: mutation.type,
        key: mutation.key,
        value: task,
      }),
      value: task,
    } satisfies PreparedMutation;
  });

  #applyMutation(prepared: PreparedMutation) {
    const { mutation } = prepared;
    if (prepared.collection === laneCollectionId) {
      if (mutation.type === "delete") {
        if (this.lanes.has(mutation.key)) {
          this.lanes.delete(mutation.key);
        }
        return;
      }

      const lane = prepared.value;
      if (lane === undefined) {
        throw new Error("Prepared lane mutation is missing its value");
      }
      if (this.lanes.has(mutation.key)) {
        this.lanes.update(mutation.key, (draft) => {
          Object.assign(draft, lane);
        });
      } else {
        this.lanes.insert(lane);
      }
      return;
    }

    if (mutation.type === "delete") {
      if (this.tasks.has(mutation.key)) {
        this.tasks.delete(mutation.key);
      }
      return;
    }

    const task = prepared.value;
    if (task === undefined) {
      throw new Error("Prepared task mutation is missing its value");
    }
    if (this.tasks.has(mutation.key)) {
      this.tasks.update(mutation.key, (draft) => {
        replaceTask(draft, task);
      });
    } else {
      this.tasks.insert(task);
    }
  }

  #enforcedCompletionMutations(incoming: ReadonlyArray<Mutation>): Mutation[] {
    const completedIds = incoming.flatMap((mutation) => {
      if (mutation.collection !== taskCollectionId || mutation.type === "delete") {
        return [];
      }

      const task = this.tasks.get(mutation.key);
      return task?.completed === true ? [mutation.key] : [];
    });

    return enforcedDescendantCompletions(this.tasks, completedIds).map(
      (task) =>
        new Mutation({
          collection: taskCollectionId,
          type: "update",
          key: task.id,
          value: task,
        }),
    );
  }

  #enforcedOrphanRehomeMutations(incoming: ReadonlyArray<Mutation>): Mutation[] {
    const deletedLaneIds = incoming.flatMap((mutation) =>
      mutation.collection === laneCollectionId && mutation.type === "delete" ? [mutation.key] : [],
    );
    const outgoing: Mutation[] = [];
    for (const laneId of deletedLaneIds) {
      const leftover = tasksInLane(this.tasks.toArray, laneId);
      if (leftover.length === 0) {
        continue;
      }

      rehomeTasksForDeletedLane(this.tasks, laneId);
      for (const task of leftover) {
        const next = this.tasks.get(task.id);
        if (next === undefined) {
          continue;
        }

        outgoing.push(
          new Mutation({
            collection: taskCollectionId,
            type: "update",
            key: next.id,
            value: next,
          }),
        );
      }
    }

    return outgoing;
  }

  #enqueueLinkEnrichment(mutations: ReadonlyArray<Mutation>, originatingTransactionId: string) {
    const taskIds = this.#taskInsertsNeedingAttachments(mutations);
    if (taskIds.length === 0) {
      return;
    }

    const startedAt = Date.now();
    const enrichmentId = crypto.randomUUID();
    this.ctx.waitUntil(
      linkPreviewRuntime.runPromise(
        this.#enrichInsertedTasks(taskIds, startedAt, enrichmentId, originatingTransactionId).pipe(
          Effect.catch(() =>
            logBoardSync("enrichment_finished", {
              durationMs: Date.now() - startedAt,
              enrichmentId,
              originatingTransactionId,
              outcome: "failure",
              taskCount: taskIds.length,
            }),
          ),
        ),
      ),
    );
  }

  #taskInsertsNeedingAttachments(mutations: ReadonlyArray<Mutation>): string[] {
    return mutations.flatMap((mutation) => {
      if (mutation.collection !== taskCollectionId || mutation.type !== "insert") {
        return [];
      }

      const task = this.tasks.get(mutation.key);
      if (
        task === undefined ||
        (task.attachments !== undefined && task.attachments.length > 0) ||
        !titleMayContainHttpUrl(task.title)
      ) {
        return [];
      }

      return [task.id];
    });
  }

  #enrichInsertedTasks = Effect.fn("BoardObject.enrichInsertedTasks")(function* (
    this: BoardObject,
    taskIds: ReadonlyArray<string>,
    startedAt: number,
    enrichmentId: string,
    originatingTransactionId: string,
  ) {
    yield* Effect.annotateCurrentSpan({
      enrichmentId,
      originatingTransactionId,
      taskCount: taskIds.length,
    });
    yield* logBoardSync("enrichment_started", {
      enrichmentId,
      originatingTransactionId,
      outcome: "started",
      taskCount: taskIds.length,
    });
    const updates: Array<{ id: string; attachments: NonNullable<Task["attachments"]> }> = [];
    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (task === undefined || (task.attachments !== undefined && task.attachments.length > 0)) {
        continue;
      }

      const attachments = yield* attachmentsForTitle(task.title);
      if (attachments.length === 0) {
        continue;
      }

      updates.push({ id: taskId, attachments });
    }

    if (updates.length === 0) {
      yield* logBoardSync("enrichment_finished", {
        durationMs: Date.now() - startedAt,
        enrichmentId,
        originatingTransactionId,
        outcome: "no_changes",
        taskCount: taskIds.length,
        updateCount: 0,
      });
      return;
    }

    yield* this.#persist(() => {
      for (const update of updates) {
        const current = this.tasks.get(update.id);
        if (
          current === undefined ||
          (current.attachments !== undefined && current.attachments.length > 0)
        ) {
          continue;
        }

        this.tasks.update(update.id, (draft) => {
          draft.attachments = [...update.attachments];
        });
      }
    }, "server_enrichment");

    const outgoing = updates.flatMap((update) => {
      const task = this.tasks.get(update.id);
      if (task?.attachments === undefined || task.attachments.length === 0) {
        return [];
      }

      return [
        new Mutation({
          collection: taskCollectionId,
          type: "update",
          key: task.id,
          value: task,
        }),
      ];
    });
    yield* this.broadcastSyncMutations(outgoing);
    yield* logBoardSync("enrichment_finished", {
      durationMs: Date.now() - startedAt,
      enrichmentId,
      originatingTransactionId,
      outcome: "success",
      taskCount: taskIds.length,
      updateCount: outgoing.length,
    });
  });
}

export function handleBoardRequest(request: Request, env: Env, id: string): Promise<Response> {
  return env.BOARD.get(env.BOARD.idFromName(id)).fetch(request);
}
