import type { Collection } from "@tanstack/db";
import type { OfflineExecutor } from "@tanstack/offline-transactions";
import type { Note, Whiteboard } from "~/board/schema";
import type { SyncedLaneCollection, SyncedTaskCollection } from "~/board/sync/collections";
import type { SyncTransport } from "~/sync/transport";

export type BoardClient = {
  lanes: SyncedLaneCollection;
  tasks: SyncedTaskCollection;
  notes: Collection<Note, string>;
  whiteboards: Collection<Whiteboard, string>;
  offline: OfflineExecutor;
  transport: SyncTransport;
};
