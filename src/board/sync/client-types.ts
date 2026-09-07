import type { Collection } from "@tanstack/db";
import type { OfflineExecutor } from "@tanstack/offline-transactions";
import type { Lane, Note, Whiteboard } from "~/board/schema";
import type { SyncedTaskCollection } from "~/board/sync/collections";
import type { createDerivedBoardCollections } from "~/board/sync/live";
import type { SyncTransport } from "~/sync/transport";

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
};
