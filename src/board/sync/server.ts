import { createCloudflareDOSQLitePersistence } from "@tanstack/cloudflare-durable-objects-db-sqlite-persistence";
import { createTransaction } from "@tanstack/db";
import { Effect } from "effect";

import {
  BoardMigrationError,
  materializeTaskCollapse,
  runBoardMigrations,
} from "~/board/data/migrations";
import { attachmentsForTitle } from "~/board/links/enrich";
import { titleMayContainHttpUrl } from "~/board/links/extract";
import { linkPreviewRuntime } from "~/board/links/runtime";
import { decodeLane, decodeNote, decodeTaskMutation, decodeWhiteboard } from "~/board/sync/codec";
import {
  createLaneCollection,
  createNoteCollection,
  createTaskCollection,
  createWhiteboardCollection,
  laneCollectionId,
  noteCollectionId,
  taskCollectionId,
  whiteboardCollectionId,
} from "~/board/sync/collections";
import { emptyNoteDocument, Lane, Note, Task, Whiteboard } from "~/board/schema";
import {
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

const boardDataVersionKey = "board:data-version";

type PreparedMutation =
  | { collection: typeof laneCollectionId; mutation: Mutation; value?: Lane }
  | { collection: typeof taskCollectionId; mutation: Mutation; value?: Task }
  | { collection: typeof noteCollectionId; mutation: Mutation; value?: Note }
  | { collection: typeof whiteboardCollectionId; mutation: Mutation; value?: Whiteboard };

type PendingTaskState = Map<string, Task | undefined>;

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

function replaceTask(draft: Partial<Task>, next: Task) {
  const preservedAttachments = draft.attachments;
  for (const key of optionalTaskKeys) {
    if (next[key] === undefined) {
      // TanStack DB tracks assignments; deleting a key does not clear persisted placement.
      Object.assign(draft, { [key]: undefined });
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

  notes = createNoteCollection(this.persistence);

  whiteboards = createWhiteboardCollection(this.persistence);

  protected override async initializeSync() {
    await Promise.all([
      this.lanes.preload(),
      this.tasks.preload(),
      this.notes.preload(),
      this.whiteboards.preload(),
    ]);
    await serverRuntime.runPromise(this.#runMigrations());
    await serverRuntime.runPromise(
      this.#persist(() => {
        normalizeStoredBoard({ lanes: this.lanes, tasks: this.tasks });
        for (const task of this.tasks.toArray) {
          if (!this.notes.has(task.id)) {
            this.notes.insert({ taskId: task.id, content: emptyNoteDocument() });
          }
        }
        for (const note of this.notes.toArray) {
          if (!this.tasks.has(note.taskId)) {
            this.notes.delete(note.taskId);
          }
        }
        for (const whiteboard of this.whiteboards.toArray) {
          if (!this.tasks.has(whiteboard.taskId)) {
            this.whiteboards.delete(whiteboard.taskId);
          }
        }
      }, "initialize"),
    );
  }

  #runMigrations = Effect.fn("BoardObject.runMigrations")(function* (this: BoardObject) {
    yield* runBoardMigrations({
      readVersion: () =>
        Effect.tryPromise({
          try: () => this.ctx.storage.get<number>(boardDataVersionKey),
          catch: (cause) => new BoardMigrationError({ cause, operation: "read-version" }),
        }),
      materializeTaskCollapse: () =>
        this.#persist(() => {
          materializeTaskCollapse(this.tasks);
        }, "migrate_task_collapse").pipe(
          Effect.mapError(
            (cause) => new BoardMigrationError({ cause, operation: "materialize-collapse" }),
          ),
        ),
      writeVersion: (version) =>
        Effect.tryPromise({
          try: () => this.ctx.storage.put(boardDataVersionKey, version),
          catch: (cause) => new BoardMigrationError({ cause, operation: "write-version" }),
        }),
    });
  });

  protected override async readSyncSnapshot(): Promise<ReadonlyArray<SyncSnapshot>> {
    await Promise.all([
      this.lanes.preload(),
      this.tasks.preload(),
      this.notes.preload(),
      this.whiteboards.preload(),
    ]);
    return [
      { collection: laneCollectionId, values: this.lanes.toArray },
      { collection: taskCollectionId, values: this.tasks.toArray },
      {
        collection: noteCollectionId,
        values: this.notes.toArray.filter((note) => {
          const task = this.tasks.get(note.taskId);
          return task !== undefined && !task.completed;
        }),
      },
      {
        collection: whiteboardCollectionId,
        values: this.whiteboards.toArray.filter((whiteboard) => {
          const task = this.tasks.get(whiteboard.taskId);
          return task !== undefined && !task.completed;
        }),
      },
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
              this.notes.utils.acceptMutations(pending),
              this.whiteboards.utils.acceptMutations(pending),
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
        // Descendant completions arrive as explicit task mutations. Re-deriving them here can use
        // a stale parent relationship when an earlier move or unnest is still in the outbox.
        outgoing = [
          ...applied,
          ...this.#enforcedOrphanRehomeMutations(applied),
          ...this.#enforcedTaskNoteMutations(applied),
          ...this.#enforcedTaskWhiteboardMutations(applied),
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
    const applied: Array<PreparedMutation | undefined> = Array.from({
      length: mutations.length,
    });
    const pendingTasks: PendingTaskState = new Map();

    for (const [index, mutation] of mutations.entries()) {
      if (mutation.collection !== taskCollectionId) {
        continue;
      }

      const prepared = yield* this.#prepareTaskMutation(mutation);
      applied[index] = prepared;
      pendingTasks.set(mutation.key, prepared.value);
    }

    for (const [index, mutation] of mutations.entries()) {
      if (applied[index] !== undefined) {
        continue;
      }

      applied[index] = yield* this.#prepareMutation(mutation, pendingTasks);
    }
    yield* logBoardSync("mutations_prepared", {
      durationMs: Date.now() - startedAt,
      outcome: "success",
      ...mutationTelemetry(mutations),
    });
    return applied.filter((mutation): mutation is PreparedMutation => mutation !== undefined);
  });

  #prepareMutation = Effect.fn("BoardObject.prepareMutation")(function* (
    this: BoardObject,
    mutation: Mutation,
    pendingTasks: PendingTaskState,
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

    if (mutation.collection === noteCollectionId) {
      return yield* this.#prepareNoteMutation(mutation, pendingTasks);
    }

    if (mutation.collection === whiteboardCollectionId) {
      return yield* this.#prepareWhiteboardMutation(mutation, pendingTasks);
    }

    return yield* new SyncProtocolError({
      message: `Unknown board collection ${mutation.collection}`,
    });
  });

  #prepareTaskMutation = Effect.fn("BoardObject.prepareTaskMutation")(function* (
    this: BoardObject,
    mutation: Mutation,
  ) {
    if (mutation.collection !== taskCollectionId) {
      return yield* new SyncProtocolError({ message: "Expected a task mutation" });
    }

    if (mutation.type === "delete") {
      return { collection: taskCollectionId, mutation } satisfies PreparedMutation;
    }

    if (mutation.value === undefined) {
      // oxlint-disable-next-line typescript/consistent-return -- typed Effect failure
      return yield* new SyncProtocolError({ message: `Missing value for ${mutation.type}` });
    }

    const task = normalizeTask(
      yield* decodeTaskMutation(
        mutation.value,
        mutation.type === "update" ? this.tasks.get(mutation.key) : undefined,
      ),
    );
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

  #prepareNoteMutation = Effect.fn("BoardObject.prepareNoteMutation")(function* (
    this: BoardObject,
    mutation: Mutation,
    pendingTasks: PendingTaskState,
  ) {
    if (mutation.type === "delete") {
      const task = pendingTasks.has(mutation.key)
        ? pendingTasks.get(mutation.key)
        : this.tasks.get(mutation.key);
      if (task !== undefined) {
        return yield* new SyncProtocolError({ message: "Notes can only be deleted with a task" });
      }
      return { collection: noteCollectionId, mutation } satisfies PreparedMutation;
    }

    if (mutation.value === undefined) {
      return yield* new SyncProtocolError({ message: "Missing note value" });
    }

    const note = yield* decodeNote(mutation.value);
    if (note.taskId !== mutation.key) {
      return yield* new SyncProtocolError({
        message: "Note mutation key does not match taskId",
      });
    }

    const task = pendingTasks.has(note.taskId)
      ? pendingTasks.get(note.taskId)
      : this.tasks.get(note.taskId);
    if (task === undefined || task.completed) {
      return yield* new SyncProtocolError({ message: "Notes require an active task" });
    }

    return {
      collection: noteCollectionId,
      mutation: new Mutation({
        collection: mutation.collection,
        type: mutation.type,
        key: mutation.key,
        value: note,
      }),
      value: note,
    } satisfies PreparedMutation;
  });

  #prepareWhiteboardMutation = Effect.fn("BoardObject.prepareWhiteboardMutation")(function* (
    this: BoardObject,
    mutation: Mutation,
    pendingTasks: PendingTaskState,
  ) {
    if (mutation.type === "delete") {
      const task = pendingTasks.has(mutation.key)
        ? pendingTasks.get(mutation.key)
        : this.tasks.get(mutation.key);
      if (task !== undefined) {
        return yield* new SyncProtocolError({
          message: "Whiteboards can only be deleted with a task",
        });
      }
      return { collection: whiteboardCollectionId, mutation } satisfies PreparedMutation;
    }

    if (mutation.value === undefined) {
      return yield* new SyncProtocolError({ message: "Missing whiteboard value" });
    }

    const whiteboard = yield* decodeWhiteboard(mutation.value);
    if (whiteboard.taskId !== mutation.key) {
      return yield* new SyncProtocolError({
        message: "Whiteboard mutation key does not match taskId",
      });
    }

    const task = pendingTasks.has(whiteboard.taskId)
      ? pendingTasks.get(whiteboard.taskId)
      : this.tasks.get(whiteboard.taskId);
    if (task === undefined || task.completed) {
      return yield* new SyncProtocolError({ message: "Whiteboards require an active task" });
    }

    return {
      collection: whiteboardCollectionId,
      mutation: new Mutation({
        collection: mutation.collection,
        type: mutation.type,
        key: mutation.key,
        value: whiteboard,
      }),
      value: whiteboard,
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

    if (prepared.collection === taskCollectionId && mutation.type === "delete") {
      if (this.tasks.has(mutation.key)) {
        this.tasks.delete(mutation.key);
      }
      return;
    }

    if (prepared.collection === taskCollectionId) {
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
      return;
    }

    if (prepared.collection === whiteboardCollectionId && mutation.type === "delete") {
      if (this.whiteboards.has(mutation.key)) {
        this.whiteboards.delete(mutation.key);
      }
      return;
    }

    if (prepared.collection === whiteboardCollectionId) {
      const whiteboard = prepared.value;
      if (whiteboard === undefined) {
        throw new Error("Prepared whiteboard mutation is missing its value");
      }
      if (this.whiteboards.has(mutation.key)) {
        this.whiteboards.update(mutation.key, (draft) => {
          Object.assign(draft, { document: whiteboard.document });
        });
      } else {
        this.whiteboards.insert(whiteboard);
      }
      return;
    }

    if (mutation.type === "delete") {
      if (this.notes.has(mutation.key)) {
        this.notes.delete(mutation.key);
      }
      return;
    }

    const note = prepared.value;
    if (note === undefined) {
      throw new Error("Prepared note mutation is missing its value");
    }
    if (this.notes.has(mutation.key)) {
      this.notes.update(mutation.key, (draft) => {
        Object.assign(draft, { content: note.content });
      });
    } else {
      this.notes.insert(note);
    }
  }

  #enforcedTaskNoteMutations(incoming: ReadonlyArray<Mutation>): Mutation[] {
    const outgoing: Mutation[] = [];
    const incomingNoteDeletes = new Set(
      incoming.flatMap((mutation) =>
        mutation.collection === noteCollectionId && mutation.type === "delete"
          ? [mutation.key]
          : [],
      ),
    );

    for (const mutation of incoming) {
      if (mutation.collection !== taskCollectionId) {
        continue;
      }

      if (mutation.type === "delete") {
        if (this.notes.has(mutation.key)) {
          this.notes.delete(mutation.key);
          if (!incomingNoteDeletes.has(mutation.key)) {
            outgoing.push(
              new Mutation({
                collection: noteCollectionId,
                type: "delete",
                key: mutation.key,
              }),
            );
          }
        }
        continue;
      }

      const task = this.tasks.get(mutation.key);
      if (task === undefined) {
        continue;
      }
      if (task.completed) {
        if (!this.notes.has(mutation.key)) {
          this.notes.insert({ taskId: mutation.key, content: emptyNoteDocument() });
        }
        outgoing.push(
          new Mutation({
            collection: noteCollectionId,
            type: "delete",
            key: mutation.key,
          }),
        );
        continue;
      }
      if (!this.notes.has(mutation.key)) {
        const note = { taskId: mutation.key, content: emptyNoteDocument() };
        this.notes.insert(note);
        outgoing.push(
          new Mutation({
            collection: noteCollectionId,
            type: "insert",
            key: mutation.key,
            value: note,
          }),
        );
      }
    }

    return outgoing;
  }

  #enforcedTaskWhiteboardMutations(incoming: ReadonlyArray<Mutation>): Mutation[] {
    const outgoing: Mutation[] = [];
    const incomingWhiteboardDeletes = new Set(
      incoming.flatMap((mutation) =>
        mutation.collection === whiteboardCollectionId && mutation.type === "delete"
          ? [mutation.key]
          : [],
      ),
    );

    for (const mutation of incoming) {
      if (mutation.collection !== taskCollectionId) {
        continue;
      }

      if (mutation.type === "delete") {
        if (this.whiteboards.has(mutation.key)) {
          this.whiteboards.delete(mutation.key);
          if (!incomingWhiteboardDeletes.has(mutation.key)) {
            outgoing.push(
              new Mutation({
                collection: whiteboardCollectionId,
                type: "delete",
                key: mutation.key,
              }),
            );
          }
        }
        continue;
      }

      const task = this.tasks.get(mutation.key);
      if (task?.completed && this.whiteboards.has(mutation.key)) {
        outgoing.push(
          new Mutation({
            collection: whiteboardCollectionId,
            type: "delete",
            key: mutation.key,
          }),
        );
      }
    }

    return outgoing;
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
    const taskIds = this.#tasksNeedingAttachments(mutations);
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

  #tasksNeedingAttachments(mutations: ReadonlyArray<Mutation>): string[] {
    return mutations.flatMap((mutation) => {
      if (mutation.collection !== taskCollectionId || mutation.type === "delete") {
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
