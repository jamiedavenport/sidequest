import { createCloudflareDOSQLitePersistence } from "@tanstack/cloudflare-durable-objects-db-sqlite-persistence";
import { createTransaction, type PendingMutation } from "@tanstack/db";
import { Effect } from "effect";
import {
  BoardMigrationError,
  materializeTaskCollapse,
  runBoardMigrations,
} from "~/board/data/migrations";
import { persistBoardSeed } from "~/board/seeds/persist";
import { BoardSeedError, type BoardSeed } from "~/board/seeds/schema";
import type { SyncSnapshot } from "~/sync/durable-object";
import { SyncProtocolError } from "~/sync/protocol";
import {
  createLaneCollection,
  createTaskCollection,
  createNoteCollection,
  createWhiteboardCollection,
  laneCollectionId,
  taskCollectionId,
  noteCollectionId,
  whiteboardCollectionId,
} from "./collections";
import { logBoardSync } from "./telemetry";

const boardDataVersionKey = "board:data-version";

/** Writes and revision changes run inside the Durable Object's serialization queue. */
export class BoardStore {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly afterPersist: (
      mutations: ReadonlyArray<PendingMutation>,
    ) => Effect.Effect<void, SyncProtocolError>,
    private readonly broadcastSnapshot: () => Promise<void>,
  ) {
    const persistence = createCloudflareDOSQLitePersistence({ storage });
    this.lanes = createLaneCollection(persistence);
    this.tasks = createTaskCollection(persistence);
    this.notes = createNoteCollection(persistence);
    this.whiteboards = createWhiteboardCollection(persistence);
  }

  readonly lanes;
  readonly tasks;
  readonly notes;
  readonly whiteboards;

  revision = 0;

  async preload() {
    await Promise.all([
      this.lanes.preload(),
      this.tasks.preload(),
      this.notes.preload(),
      this.whiteboards.preload(),
    ]);
    this.revision = (await this.storage.get<number>("board:revision")) ?? 0;
  }

  persist = Effect.fn("BoardStore.persist")(function* (
    this: BoardStore,
    mutate: () => void,
    operation: string,
    transactionId?: string,
  ): Effect.fn.Return<void, SyncProtocolError> {
    const startedAt = Date.now();
    yield* Effect.annotateCurrentSpan({
      operation,
      ...(transactionId === undefined ? {} : { transactionId }),
    });
    const mutations = yield* this.commitTransaction(mutate);
    yield* this.afterPersist(mutations);
    yield* logBoardSync("persistence_committed", {
      durationMs: Date.now() - startedAt,
      operation,
      outcome: "success",
      ...(transactionId === undefined ? {} : { transactionId }),
    });
  });

  private commitTransaction = Effect.fn("BoardStore.commitTransaction")(function* (
    this: BoardStore,
    mutate: () => void,
  ) {
    const transaction = createTransaction({
      autoCommit: false,
      mutationFn: ({ transaction: pending }) =>
        Promise.all([
          this.lanes.utils.acceptMutations(pending),
          this.tasks.utils.acceptMutations(pending),
          this.notes.utils.acceptMutations(pending),
          this.whiteboards.utils.acceptMutations(pending),
        ]).then(() => undefined),
    });
    yield* Effect.try({
      try: () => transaction.mutate(mutate),
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });
    yield* Effect.tryPromise({
      try: () => transaction.commit(),
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });
    this.revision += 1;
    yield* Effect.tryPromise({
      try: () => this.storage.put("board:revision", this.revision),
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });
    return transaction.mutations;
  });
  runMigrations = Effect.fn("BoardStore.runMigrations")(function* (this: BoardStore) {
    yield* runBoardMigrations({
      readVersion: () =>
        Effect.tryPromise({
          try: () => this.storage.get<number>(boardDataVersionKey),
          catch: (cause) => new BoardMigrationError({ cause, operation: "read-version" }),
        }),
      materializeTaskCollapse: () =>
        this.persist(() => {
          materializeTaskCollapse(this.tasks);
        }, "migrate_task_collapse").pipe(
          Effect.mapError(
            (cause) => new BoardMigrationError({ cause, operation: "materialize-collapse" }),
          ),
        ),
      writeVersion: (version) =>
        Effect.tryPromise({
          try: () => this.storage.put(boardDataVersionKey, version),
          catch: (cause) => new BoardMigrationError({ cause, operation: "write-version" }),
        }),
    });
  });

  seedBoard = Effect.fn("BoardStore.seedBoard")(function* (this: BoardStore, seed: BoardSeed) {
    const seeded = yield* persistBoardSeed(
      {
        lanes: this.lanes,
        tasks: this.tasks,
        notes: this.notes,
        whiteboards: this.whiteboards,
      },
      seed,
    );
    if (seeded) {
      this.revision += 1;
      yield* Effect.tryPromise({
        try: () => this.storage.put("board:revision", this.revision),
        catch: () => new BoardSeedError({ message: "Could not save seed revision." }),
      });
      yield* Effect.tryPromise({
        try: () => this.broadcastSnapshot(),
        catch: () => new BoardSeedError({ message: "Could not broadcast board seed." }),
      });
    }
    return seeded;
  });

  async readSnapshot(): Promise<ReadonlyArray<SyncSnapshot>> {
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
}
