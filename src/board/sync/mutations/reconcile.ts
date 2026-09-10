import { emptyNoteDocument } from "~/board/schema";
import { tasksInLane, rehomeTasksForDeletedLane } from "~/board/views";
import { Mutation } from "~/sync/protocol";
import {
  laneCollectionId,
  taskCollectionId,
  noteCollectionId,
  whiteboardCollectionId,
  type BoardCollections,
} from "../collections";

function reconcileTaskNote(
  { tasks, notes }: Pick<BoardCollections, "tasks" | "notes">,
  mutation: Mutation,
): Mutation | undefined {
  if (mutation.type === "delete") {
    if (!notes.has(mutation.key)) {
      return undefined;
    }
    notes.delete(mutation.key);
    return new Mutation({ collection: noteCollectionId, type: "delete", key: mutation.key });
  }
  const task = tasks.get(mutation.key);
  if (!task) {
    return undefined;
  }
  const exists = notes.has(task.id);
  const note = { taskId: task.id, content: emptyNoteDocument() };
  if (!exists) {
    notes.insert(note);
  }
  // Completed tasks keep their stored note but remove it from active client collections.
  if (task.completed) {
    return new Mutation({ collection: noteCollectionId, type: "delete", key: task.id });
  }
  if (!exists) {
    return new Mutation({
      collection: noteCollectionId,
      type: "insert",
      key: task.id,
      value: note,
    });
  }
  return undefined;
}

export function reconcileTaskNotes(
  collections: Pick<BoardCollections, "tasks" | "notes">,
  incoming: ReadonlyArray<Mutation>,
): Mutation[] {
  const deletedNotes = new Set(
    incoming
      .filter((mutation) => mutation.collection === noteCollectionId && mutation.type === "delete")
      .map((mutation) => mutation.key),
  );
  return incoming.flatMap((mutation) => {
    if (mutation.collection !== taskCollectionId) {
      return [];
    }
    const change = reconcileTaskNote(collections, mutation);
    if (!change || (mutation.type === "delete" && deletedNotes.has(mutation.key))) {
      return [];
    }
    return [change];
  });
}

export function reconcileTaskWhiteboards(
  collections: Pick<BoardCollections, "tasks" | "whiteboards">,
  incoming: ReadonlyArray<Mutation>,
): Mutation[] {
  const outgoing: Mutation[] = [];
  const incomingWhiteboardDeletes = new Set(
    incoming.flatMap((mutation) =>
      mutation.collection === whiteboardCollectionId && mutation.type === "delete"
        ? [mutation.key]
        : [],
    ),
  );

  for (const mutation of incoming) {
    if (mutation.collection !== taskCollectionId) {
      continue;
    }

    if (mutation.type === "delete") {
      if (collections.whiteboards.has(mutation.key)) {
        collections.whiteboards.delete(mutation.key);
        if (!incomingWhiteboardDeletes.has(mutation.key)) {
          outgoing.push(
            new Mutation({
              collection: whiteboardCollectionId,
              type: "delete",
              key: mutation.key,
            }),
          );
        }
      }
      continue;
    }

    const task = collections.tasks.get(mutation.key);
    if (task?.completed && collections.whiteboards.has(mutation.key)) {
      outgoing.push(
        new Mutation({
          collection: whiteboardCollectionId,
          type: "delete",
          key: mutation.key,
        }),
      );
    }
  }

  return outgoing;
}

export function rehomeOrphanTasks(
  collections: Pick<BoardCollections, "tasks">,
  incoming: ReadonlyArray<Mutation>,
): Mutation[] {
  const deletedLaneIds = incoming.flatMap((mutation) =>
    mutation.collection === laneCollectionId && mutation.type === "delete" ? [mutation.key] : [],
  );
  const outgoing: Mutation[] = [];
  for (const laneId of deletedLaneIds) {
    const leftover = tasksInLane(collections.tasks.toArray, laneId);
    if (leftover.length === 0) {
      continue;
    }

    rehomeTasksForDeletedLane(collections.tasks, laneId);
    for (const task of leftover) {
      const next = collections.tasks.get(task.id);
      if (next === undefined) {
        continue;
      }

      outgoing.push(
        new Mutation({
          collection: taskCollectionId,
          type: "update",
          key: next.id,
          value: next,
        }),
      );
    }
  }

  return outgoing;
}
