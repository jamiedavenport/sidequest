import { reportBrowserEvent } from "~/telemetry/browser";
import {
  BroadcastChannelLeader,
  IndexedDBAdapter,
  LocalStorageAdapter,
  WebLocksLeader,
} from "@tanstack/offline-transactions";
import { Effect, Schema } from "effect";

export class BoardStorageError extends Schema.TaggedError<BoardStorageError>()(
  "BoardStorageError",
  {
    stage: Schema.Literals(["outbox", "database", "executor", "collections"]),
    cause: Schema.Defect(),
  },
) {}

export const openBoardOutbox = Effect.fn("openBoardOutbox")(function* (userId: string) {
  const namespace = `sidequest-outbox-v2-${userId}`;
  const indexedDB = yield* Effect.tryPromise({
    try: () => IndexedDBAdapter.probe(),
    catch: (cause) => new BoardStorageError({ stage: "outbox", cause }),
  });
  const storage = indexedDB.available
    ? new IndexedDBAdapter(namespace, "transactions")
    : yield* Effect.try({
        try: () => {
          const probe = LocalStorageAdapter.probe();
          if (!probe.available) {
            throw probe.error;
          }
          return new LocalStorageAdapter(`${namespace}:`);
        },
        catch: (cause) => new BoardStorageError({ stage: "outbox", cause }),
      });
  reportBrowserEvent(indexedDB.available ? "storage_initialized" : "storage_fallback", {
    storage: indexedDB.available ? "indexeddb" : "localstorage",
  });
  const leaderElection = yield* Effect.acquireRelease(
    Effect.sync(() =>
      WebLocksLeader.isSupported()
        ? new WebLocksLeader(`${namespace}-leader`)
        : new BroadcastChannelLeader(`${namespace}-leader`),
    ),
    (leader) =>
      Effect.sync(() => {
        leader.releaseLeadership();
        if (leader instanceof BroadcastChannelLeader) {
          leader.dispose();
        }
      }),
  );
  return { storage, leaderElection };
});
