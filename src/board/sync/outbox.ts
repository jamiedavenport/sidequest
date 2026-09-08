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
  {},
) {}

export const openBoardOutbox = Effect.fn("openBoardOutbox")(function* (userId: string) {
  const namespace = `sidequest-outbox-v2-${userId}`;
  const indexedDB = yield* Effect.tryPromise({
    try: () => IndexedDBAdapter.probe(),
    catch: () => new BoardStorageError(),
  });
  const storage = indexedDB.available
    ? new IndexedDBAdapter(namespace, "transactions")
    : yield* Effect.try({
        try: () => {
          if (!LocalStorageAdapter.probe().available) {
            throw new BoardStorageError();
          }
          return new LocalStorageAdapter(`${namespace}:`);
        },
        catch: () => new BoardStorageError(),
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
