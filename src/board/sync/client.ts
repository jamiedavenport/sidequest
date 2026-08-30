import type { Collection } from "@tanstack/db";
import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/browser-db-sqlite-persistence";
import { startOfflineExecutor } from "@tanstack/offline-transactions";
import type { OfflineExecutor } from "@tanstack/offline-transactions";
import { createContext, useContext } from "react";

import {
  boardCollectionIds,
  createSyncedLaneCollection,
  createSyncedTaskCollection,
  laneCollectionId,
  taskCollectionId,
} from "~/board/sync/collections";
import { decodeLaneSync, decodeTaskSync } from "~/board/sync/codec";
import { createDerivedBoardCollections } from "~/board/sync/live";
import { Lane, Task, userId } from "~/board/schema";
import { inboxLaneId, isSystemLane, migrateLegacySystemLanes, todayLaneId } from "~/board/views";
import { collectionSync, SyncTransport, transactionMutations } from "~/sync/transport";

type DerivedBoardCollections = ReturnType<typeof createDerivedBoardCollections>;

export type BoardClient = {
  lanes: Collection<Lane, string>;
  tasks: Collection<Task, string>;
  inbox: DerivedBoardCollections["inbox"];
  today: DerivedBoardCollections["today"];
  projects: DerivedBoardCollections["projects"];
  offline: OfflineExecutor;
  transport: SyncTransport;
  close: () => Promise<void>;
};

let sharedClient: Promise<BoardClient> | undefined;

export function acquireBoardClient(): Promise<BoardClient> {
  sharedClient ??= createBoardClient().catch((error: unknown) => {
    sharedClient = undefined;
    throw error;
  });
  return sharedClient;
}

async function createBoardClient(): Promise<BoardClient> {
  const database = await openBrowserWASQLiteOPFSDatabase({
    databaseName: "sidequest-board.sqlite",
  });
  const coordinator = new BrowserCollectionCoordinator({
    dbName: "sidequest-board",
  });
  const persistence = createBrowserWASQLitePersistence({
    database,
    coordinator,
  });
  const transport = new SyncTransport({
    url: boardSocketUrl(userId),
    collections: boardCollectionIds,
  });

  const lanes = createSyncedLaneCollection(
    persistence,
    collectionSync(transport, laneCollectionId, decodeLaneSync),
  );
  const tasks = createSyncedTaskCollection(
    persistence,
    collectionSync(transport, taskCollectionId, decodeTaskSync),
  );

  const offline = startOfflineExecutor({
    collections: { lanes, tasks },
    mutationFns: {
      persistBoard: async ({ transaction, idempotencyKey }) => {
        await transport.mutate(transactionMutations(transport, transaction), idempotencyKey);
      },
    },
  });
  await offline.waitForInit();
  await Promise.all([lanes.preload(), tasks.preload()]);

  const needsMigration =
    lanes.toArray.some(isSystemLane) ||
    tasks.toArray.some((task) => task.laneId === inboxLaneId || task.laneId === todayLaneId);
  if (needsMigration) {
    const transaction = offline.createOfflineTransaction({
      autoCommit: false,
      mutationFnName: "persistBoard",
    });
    transaction.mutate(() => {
      migrateLegacySystemLanes({ lanes, tasks });
    });
    void transaction.commit();
  }

  const { inbox, today, projects } = createDerivedBoardCollections(lanes, tasks);

  return {
    lanes,
    tasks,
    inbox,
    today,
    projects,
    offline,
    transport,
    close: async () => {
      sharedClient = undefined;
      offline.dispose();
      transport.close();
      coordinator.dispose();
      await database.close?.();
    },
  };
}

function boardSocketUrl(id: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/board/${id}`;
}

const BoardClientContext = createContext<BoardClient | null>(null);

export const BoardClientProvider = BoardClientContext.Provider;

export function useBoardClient(): BoardClient {
  const client = useContext(BoardClientContext);
  if (client === null) {
    throw new Error("Board client is not ready");
  }

  return client;
}

export function useOptionalBoardClient(): BoardClient | null {
  return useContext(BoardClientContext);
}
