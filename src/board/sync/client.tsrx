import { migrateBoardDueDates } from "~/google/functions";
import { serializeTaskDate } from "~/board/date";
import { errorFingerprint, reportBrowserEvent } from "~/telemetry/browser";
import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/browser-db-sqlite-persistence";
import { startOfflineExecutor, WebOnlineDetector } from "@tanstack/offline-transactions";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { Effect } from "effect";

import { authClient } from "~/auth/client";
import { Button } from "~/components/ui/button.tsrx";
import { BoardStorageError, openBoardOutbox } from "~/board/sync/outbox";
import { useSession } from "~/auth/hooks";
import { BoardBooting } from "~/board/components/booting.tsrx";
import {
  boardCollectionIds,
  createSyncedLaneCollection,
  createSyncedNoteCollection,
  createSyncedTaskCollection,
  createSyncedWhiteboardCollection,
  laneCollectionId,
  noteCollectionId,
  taskCollectionId,
  whiteboardCollectionId,
} from "~/board/sync/collections";
import {
  decodeLaneSync,
  decodeNoteSync,
  decodeTaskSync,
  decodeWhiteboardSync,
} from "~/board/sync/codec";
import type { BoardClient } from "./client-types.ts";
import { boardNeedsNormalize, normalizeStoredBoard } from "~/board/views";
import {
  collectionSync,
  SessionValidationError,
  SyncTransport,
  transactionMutations,
} from "~/sync/transport";

const BoardClientContext = createContext<BoardClient | null>(null);

export function SyncClientProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <AccountSyncClient key={session.user.id} userId={session.user.id}>
      {children}
    </AccountSyncClient>
  );
}

function AccountSyncClient({ children, userId }: { children: ReactNode; userId: string }) {
  const [client, setClient] = useState<BoardClient | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    void Effect.runPromise(
      Effect.tryPromise(() =>
        migrateBoardDueDates({ data: { referenceDate: serializeTaskDate(new Date()) } }),
      ).pipe(Effect.ignore),
    );
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    const onAuthenticationLost = () => {
      if (controller.signal.aborted) {
        return;
      }
      setClient(null);
      controller.abort();
      window.location.assign("/login");
    };
    const lifetime = createBoardClient(userId, controller.signal, onAuthenticationLost).pipe(
      Effect.flatMap((next) =>
        Effect.sync(() => {
          if (!controller.signal.aborted) {
            setClient(next);
          }
        }),
      ),
      Effect.andThen(Effect.never),
      Effect.scoped,
      Effect.catch((error) =>
        Effect.sync(() => {
          if (controller.signal.aborted) {
            return;
          }
          reportBrowserEvent("storage_failed", {
            outcome: "unexpected_failure",
            failureStage: error.stage,
            fingerprint: errorFingerprint(error.cause),
          });
          if (import.meta.env.DEV) {
            console.error(`Board initialization failed (${error.stage})`, error.cause);
          }
          setFailed(true);
        }),
      ),
    );
    void Effect.runPromise(lifetime, { signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [userId, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  if (failed) {
    return (
      <main className="grid h-dvh place-items-center">
        <div role="alert" className="flex flex-col items-center gap-4">
          <p>Unable to open your saved board. Please try again.</p>
          <Button onClick={retry}>Retry</Button>
        </div>
      </main>
    );
  }
  if (client === null) {
    return <BoardBooting />;
  }
  return <BoardClientContext.Provider value={client}>{children}</BoardClientContext.Provider>;
}

export function useBoardClient(): BoardClient {
  const client = useContext(BoardClientContext);
  if (client === null) {
    throw new Error("Board client is not ready");
  }

  return client;
}

const createBoardClient = Effect.fn("createBoardClient")(function* (
  userId: string,
  signal: AbortSignal,
  onAuthenticationLost: () => void,
) {
  const outbox = yield* openBoardOutbox(userId);
  const databaseNamespace = `sidequest-board-${userId}`;
  const database = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => openBrowserWASQLiteOPFSDatabase({ databaseName: `${databaseNamespace}.sqlite` }),
      catch: (cause) => new BoardStorageError({ stage: "database", cause }),
    }),
    (opened) => Effect.promise(() => opened.close?.() ?? Promise.resolve()),
  );
  const coordinator = yield* Effect.acquireRelease(
    Effect.sync(() => new BrowserCollectionCoordinator({ dbName: databaseNamespace })),
    (owned) => Effect.sync(() => owned.dispose()),
  );
  const persistence = createBrowserWASQLitePersistence({
    database,
    coordinator,
  });
  const transport = yield* Effect.acquireRelease(
    Effect.sync(
      () =>
        new SyncTransport({
          url: boardSocketUrl(userId),
          validateSession: () => validateBoardSession(userId),
          onAuthenticationLost,
          onBillingRequired: () => window.location.assign("/billing"),
          collections: boardCollectionIds,
        }),
    ),
    (owned) => Effect.sync(() => owned.close()),
  );
  // Stop the transport immediately, even if a Promise-based acquisition is still finishing.
  signal.addEventListener("abort", () => transport.close(), { once: true });
  if (signal.aborted) {
    transport.close();
  }

  const lanes = createSyncedLaneCollection(
    persistence,
    collectionSync(transport, laneCollectionId, decodeLaneSync),
  );
  const tasks = createSyncedTaskCollection(
    persistence,
    collectionSync(transport, taskCollectionId, decodeTaskSync),
  );
  const notes = createSyncedNoteCollection(
    persistence,
    collectionSync(transport, noteCollectionId, decodeNoteSync),
  );
  const whiteboards = createSyncedWhiteboardCollection(
    persistence,
    collectionSync(transport, whiteboardCollectionId, decodeWhiteboardSync),
  );

  let active = true;
  const onlineDetector = new WebOnlineDetector();
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      active = false;
      onlineDetector.dispose();
    }),
  );
  const offline = yield* Effect.acquireRelease(
    Effect.gen(function* () {
      const executor = startOfflineExecutor({
        ...outbox,
        onlineDetector: {
          isOnline: () => active && !signal.aborted && onlineDetector.isOnline(),
          notifyOnline: () => onlineDetector.notifyOnline(),
          subscribe: (listener) => onlineDetector.subscribe(listener),
          dispose: () => {
            active = false;
            onlineDetector.dispose();
          },
        },
        collections: { lanes, tasks, notes, whiteboards },
        mutationFns: {
          persistBoard: async ({ transaction, idempotencyKey }) => {
            // Billing rejections remain retryable in the durable outbox across the redirect.
            await transport.mutate(transactionMutations(transport, transaction), idempotencyKey);
          },
        },
      });
      yield* Effect.tryPromise({
        try: () => executor.waitForInit(),
        catch: (cause) => new BoardStorageError({ stage: "executor", cause }),
      }).pipe(Effect.onError(() => Effect.sync(() => executor.dispose())));
      return executor;
    }),
    (executor) => Effect.sync(() => executor.dispose()),
  );
  const stopObservingOutbox = startOutboxTelemetry(offline, () => active);
  yield* Effect.addFinalizer(() => Effect.sync(stopObservingOutbox));
  yield* Effect.forEach(
    [lanes, tasks, notes, whiteboards],
    (collection) =>
      Effect.tryPromise({
        try: () => collection.preload(),
        catch: (cause) => new BoardStorageError({ stage: "collections", cause }),
      }),
    { concurrency: "unbounded", discard: true },
  );

  if (boardNeedsNormalize(lanes.toArray, tasks.toArray)) {
    const transaction = offline.createOfflineTransaction({
      autoCommit: false,
      mutationFnName: "persistBoard",
    });
    transaction.mutate(() => {
      normalizeStoredBoard({ lanes, tasks });
    });
    void transaction.commit();
  }

  return {
    lanes,
    tasks,
    notes,
    whiteboards,
    offline,
    transport,
  } satisfies BoardClient;
});

function startOutboxTelemetry(offline: BoardClient["offline"], isActive: () => boolean) {
  let previousPending = 0;
  let observingOutbox = false;
  const observeOutbox = () => {
    if (observingOutbox || !isActive()) {
      return;
    }
    observingOutbox = true;
    void offline
      .peekOutbox()
      .then((pending) => {
        if (!isActive()) {
          return;
        }
        const oldest = Math.min(Date.now(), ...pending.map((entry) => entry.createdAt.getTime()));
        reportBrowserEvent("outbox_observation", {
          pendingCount: pending.length,
          pendingAgeMs: Date.now() - oldest,
          retryAttempt: Math.max(0, ...pending.map((entry) => entry.retryCount)),
        });
        if (previousPending > 0 && pending.length === 0) {
          reportBrowserEvent("outbox_drained", { outcome: "success" });
        }
        previousPending = pending.length;
      })
      .catch(() => reportBrowserEvent("storage_failed", { storage: "outbox" }))
      .finally(() => {
        observingOutbox = false;
      });
  };
  const outboxTimer = setInterval(observeOutbox, 60_000);
  observeOutbox();
  return () => clearInterval(outboxTimer);
}

const validateBoardSession = Effect.fn("validateBoardSession")(function* (userId: string) {
  const result = yield* Effect.tryPromise({
    try: () => authClient.getSession(),
    catch: () => new SessionValidationError(),
  });
  if (result.error !== null) {
    if (result.error.status === 401) {
      return false;
    }
    return yield* new SessionValidationError();
  }
  return result.data?.user.id === userId;
});

function boardSocketUrl(userId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/board?syncVersion=3&userId=${encodeURIComponent(userId)}`;
}
