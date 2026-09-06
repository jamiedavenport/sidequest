import type { Collection } from "@tanstack/db";
import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
} from "@tanstack/browser-db-sqlite-persistence";
import { startOfflineExecutor } from "@tanstack/offline-transactions";
import type { OfflineExecutor } from "@tanstack/offline-transactions";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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
  type SyncedTaskCollection,
} from "~/board/sync/collections";
import {
  decodeLaneSync,
  decodeNoteSync,
  decodeTaskSync,
  decodeWhiteboardSync,
} from "~/board/sync/codec";
import { createDerivedBoardCollections } from "~/board/sync/live";
import { Lane, Note, Whiteboard } from "~/board/schema";
import { boardNeedsNormalize, normalizeStoredBoard } from "~/board/views";
import { collectionSync, SyncTransport, transactionMutations } from "~/sync/transport";

type DerivedBoardCollections = ReturnType<typeof createDerivedBoardCollections>;

export type BoardClient = {
  lanes: Collection<Lane, string>;
  tasks: SyncedTaskCollection;
  notes: Collection<Note, string>;
  whiteboards: Collection<Whiteboard, string>;
  inbox: DerivedBoardCollections["inbox"];
  today: DerivedBoardCollections["today"];
  projects: DerivedBoardCollections["projects"];
  offline: OfflineExecutor;
  transport: SyncTransport;
  close: () => Promise<void>;
};

const BoardClientContext = createContext<BoardClient | null>(null);

export function SyncClientProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [client, setClient] = useState<BoardClient | null>(null);

  useEffect(() => {
    void createBoardClient(session.user.id).then(setClient, (error: unknown) => {
      console.error("Failed to start the board client", error);
    });
  }, [session.user.id]);

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

async function createBoardClient(userId: string): Promise<BoardClient> {
  const databaseNamespace = `sidequest-board-${userId}`;
  const database = await openBrowserWASQLiteOPFSDatabase({
    databaseName: `${databaseNamespace}.sqlite`,
  });
  const coordinator = new BrowserCollectionCoordinator({
    dbName: databaseNamespace,
  });
  const persistence = createBrowserWASQLitePersistence({
    database,
    coordinator,
  });
  const transport = new SyncTransport({
    url: boardSocketUrl(),
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
  const notes = createSyncedNoteCollection(
    persistence,
    collectionSync(transport, noteCollectionId, decodeNoteSync),
  );
  const whiteboards = createSyncedWhiteboardCollection(
    persistence,
    collectionSync(transport, whiteboardCollectionId, decodeWhiteboardSync),
  );

  const offline = startOfflineExecutor({
    collections: { lanes, tasks, notes, whiteboards },
    mutationFns: {
      persistBoard: async ({ transaction, idempotencyKey }) => {
        await transport.mutate(transactionMutations(transport, transaction), idempotencyKey);
      },
    },
  });
  await offline.waitForInit();
  await Promise.all([lanes.preload(), tasks.preload(), notes.preload(), whiteboards.preload()]);

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

  const { inbox, today, projects } = createDerivedBoardCollections(lanes, tasks);

  return {
    lanes,
    tasks,
    notes,
    whiteboards,
    inbox,
    today,
    projects,
    offline,
    transport,
    close: async () => {
      offline.dispose();
      transport.close();
      coordinator.dispose();
      await database.close?.();
    },
  };
}

function boardSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/board`;
}
