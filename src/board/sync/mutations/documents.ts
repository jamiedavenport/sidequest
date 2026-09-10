import { Effect } from "effect";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import { decodeNote, decodeWhiteboardMutation } from "../codec";
import { noteCollectionId, whiteboardCollectionId } from "../collections";
import type { GetTask, PreparedMutation } from "./schema";

export const prepareNoteMutation = Effect.fn("prepareNoteMutation")(function* (
  mutation: Mutation,
  getTask: GetTask,
) {
  if (mutation.type === "delete") {
    const task = getTask(mutation.key);
    if (task !== undefined) {
      return yield* new SyncProtocolError({ message: "Notes can only be deleted with a task" });
    }
    return { collection: noteCollectionId, mutation } satisfies PreparedMutation;
  }

  if (mutation.value === undefined) {
    return yield* new SyncProtocolError({ message: "Missing note value" });
  }

  const note = yield* decodeNote(mutation.value);
  if (note.taskId !== mutation.key) {
    return yield* new SyncProtocolError({
      message: "Note mutation key does not match taskId",
    });
  }

  const task = getTask(note.taskId);
  if (task === undefined || task.completed) {
    return yield* new SyncProtocolError({ message: "Notes require an active task" });
  }

  return {
    collection: noteCollectionId,
    mutation: new Mutation({
      collection: mutation.collection,
      type: mutation.type,
      key: mutation.key,
      value: note,
    }),
    value: note,
  } satisfies PreparedMutation;
});

export const prepareWhiteboardMutation = Effect.fn("prepareWhiteboardMutation")(function* (
  mutation: Mutation,
  getTask: GetTask,
) {
  if (mutation.type === "delete") {
    const task = getTask(mutation.key);
    if (task !== undefined) {
      return yield* new SyncProtocolError({
        message: "Whiteboards can only be deleted with a task",
      });
    }
    return {
      collection: whiteboardCollectionId,
      mutation,
    } satisfies PreparedMutation;
  }

  if (mutation.value === undefined) {
    return yield* new SyncProtocolError({ message: "Missing whiteboard value" });
  }

  const whiteboard = yield* decodeWhiteboardMutation(mutation.value);
  if (whiteboard.taskId !== mutation.key) {
    return yield* new SyncProtocolError({
      message: "Whiteboard mutation key does not match taskId",
    });
  }

  const task = getTask(whiteboard.taskId);
  if (task === undefined || task.completed) {
    return yield* new SyncProtocolError({ message: "Whiteboards require an active task" });
  }

  return {
    collection: whiteboardCollectionId,
    mutation: new Mutation({
      collection: mutation.collection,
      type: mutation.type,
      key: mutation.key,
      value: whiteboard,
    }),
    value: whiteboard,
  } satisfies PreparedMutation;
});
