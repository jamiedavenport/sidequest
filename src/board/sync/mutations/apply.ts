import type { Task } from "~/board/schema";
import {
  laneCollectionId,
  taskCollectionId,
  noteCollectionId,
  whiteboardCollectionId,
  type BoardCollections,
} from "../collections";
import type { PreparedMutation } from "./schema";

const optionalTaskKeys = [
  "laneId",
  "parentId",
  "date",
  "attachments",
] as const satisfies ReadonlyArray<keyof Task>;

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

export function applyMutation(collections: BoardCollections, prepared: PreparedMutation) {
  const key = prepared.mutation.key;
  if (prepared.value === undefined) {
    const collection = collections[prepared.collection];
    if (collection.has(key)) {
      collection.delete(key);
    }
    return;
  }
  switch (prepared.collection) {
    case laneCollectionId: {
      const { lanes } = collections;
      if (lanes.has(key)) {
        lanes.update(key, (draft) => Object.assign(draft, prepared.value));
      } else {
        lanes.insert(prepared.value);
      }
      return;
    }
    case taskCollectionId: {
      const { tasks } = collections;
      if (tasks.has(key)) {
        tasks.update(key, (draft) => replaceTask(draft, prepared.value));
      } else {
        tasks.insert(prepared.value);
      }
      return;
    }
    case noteCollectionId: {
      const { notes } = collections;
      if (notes.has(key)) {
        notes.update(key, (draft) => {
          Object.assign(draft, { content: prepared.value.content });
        });
      } else {
        notes.insert(prepared.value);
      }
      return;
    }
    case whiteboardCollectionId: {
      const { whiteboards } = collections;
      if (whiteboards.has(key)) {
        whiteboards.update(key, (draft) => {
          Object.assign(draft, { document: prepared.value.document });
        });
      } else {
        whiteboards.insert(prepared.value);
      }
    }
  }
}
