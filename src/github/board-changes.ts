import type { PendingMutation } from "@tanstack/db";
import { Effect } from "effect";
import type { Task } from "~/board/schema";
import { emptyNoteDocument } from "~/board/schema";
import {
  laneCollectionId,
  taskCollectionId,
  type BoardCollections,
} from "~/board/sync/collections";
import type { GetTask } from "~/board/sync/mutations/schema";
import type { GitHubBoard } from "./board";

export function getCompletedGithubTasks(
  mutations: ReadonlyArray<PendingMutation>,
  getTask: GetTask,
): string[] {
  const completed = mutations.flatMap((mutation) => {
    if (
      mutation.collection.id !== taskCollectionId ||
      mutation.type === "delete" ||
      mutation.modified.completed !== true ||
      ("completed" in mutation.original && mutation.original.completed === true)
    ) {
      return [];
    }
    const id = mutation.modified.id;
    return typeof id === "string" &&
      getTask(id)?.attachments?.some((attachment) => attachment.type === "github-issue")
      ? [id]
      : [];
  });
  return completed;
}

export const disconnectDeletedGithubLanes = Effect.fn("disconnectDeletedGithubLanes")(function* (
  mutations: ReadonlyArray<PendingMutation>,
  github: GitHubBoard,
) {
  const deletedLaneIds = mutations.flatMap((mutation) =>
    mutation.collection.id === laneCollectionId &&
    mutation.type === "delete" &&
    "id" in mutation.original &&
    typeof mutation.original.id === "string"
      ? [mutation.original.id]
      : [],
  );
  yield* Effect.forEach(deletedLaneIds, (laneId) => github.disconnectLane(laneId), {
    discard: true,
  });
});

export function insertGithubTasks(
  collections: Pick<BoardCollections, "tasks" | "notes">,
  tasks: ReadonlyArray<Task>,
) {
  for (const task of tasks) {
    if (!collections.tasks.has(task.id)) {
      collections.tasks.insert(task);
    }
    if (!collections.notes.has(task.id)) {
      collections.notes.insert({ taskId: task.id, content: emptyNoteDocument() });
    }
  }
}
