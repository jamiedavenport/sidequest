import { BasicIndex, createCollection } from "@tanstack/db";
import type { Collection, SyncConfig } from "@tanstack/db";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";
import { persistedCollectionOptions } from "@tanstack/db-sqlite-persistence-core";

import { Lane, laneSchema, Task, taskSchema } from "~/board/schema";

const boardSchemaVersion = 1;
export const laneCollectionId = "lanes";
export const taskCollectionId = "tasks";
export const boardCollectionIds = [laneCollectionId, taskCollectionId] as const;

function laneOptions(persistence: PersistedCollectionPersistence) {
  return {
    id: laneCollectionId,
    schema: laneSchema,
    getKey: (lane: Lane) => lane.id,
    schemaVersion: boardSchemaVersion,
    persistence,
  };
}

function taskOptions(persistence: PersistedCollectionPersistence) {
  return {
    id: taskCollectionId,
    schema: taskSchema,
    getKey: (task: Task) => task.id,
    schemaVersion: boardSchemaVersion,
    persistence,
    defaultIndexType: BasicIndex,
    autoIndex: "eager" as const,
  };
}

function indexTasks<TCollection extends Collection<Task, string>>(collection: TCollection) {
  collection.createIndex((task) => task.laneId, { indexType: BasicIndex });
  return collection;
}

export function createLaneCollection(persistence: PersistedCollectionPersistence) {
  const options = persistedCollectionOptions<Lane, string, typeof laneSchema>(
    laneOptions(persistence),
  );
  return createCollection({ ...options, schema: laneSchema });
}

export function createTaskCollection(persistence: PersistedCollectionPersistence) {
  const options = persistedCollectionOptions<Task, string, typeof taskSchema>(
    taskOptions(persistence),
  );
  return indexTasks(createCollection({ ...options, schema: taskSchema }));
}

export function createSyncedLaneCollection(
  persistence: PersistedCollectionPersistence,
  sync: SyncConfig<Lane, string>,
) {
  const options = persistedCollectionOptions<Lane, string, typeof laneSchema>({
    ...laneOptions(persistence),
    sync,
  });
  return createCollection({ ...options, schema: laneSchema });
}

export function createSyncedTaskCollection(
  persistence: PersistedCollectionPersistence,
  sync: SyncConfig<Task, string>,
) {
  const options = persistedCollectionOptions<Task, string, typeof taskSchema>({
    ...taskOptions(persistence),
    sync,
  });
  return indexTasks(createCollection({ ...options, schema: taskSchema }));
}
