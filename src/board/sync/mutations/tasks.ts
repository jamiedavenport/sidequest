import { Effect } from "effect";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import type { AttachmentStore } from "~/board/attachments/store";
import { normalizeTask } from "~/board/views";
import { decodeTaskMutation } from "../codec";
import { taskCollectionId } from "../collections";
import type { GetTask, PreparedMutation } from "./schema";

export const prepareTaskMutation = Effect.fn("prepareTaskMutation")(function* (
  mutation: Mutation,
  getTask: GetTask,
  validateAttachments: OmitThisParameter<AttachmentStore["validateAttachments"]>,
) {
  if (mutation.collection !== taskCollectionId) {
    return yield* new SyncProtocolError({ message: "Expected a task mutation" });
  }

  if (mutation.type === "delete") {
    return { collection: taskCollectionId, mutation } satisfies PreparedMutation;
  }

  if (mutation.value === undefined) {
    // oxlint-disable-next-line typescript/consistent-return -- typed Effect failure
    return yield* new SyncProtocolError({ message: `Missing value for ${mutation.type}` });
  }

  const task = normalizeTask(
    yield* decodeTaskMutation(
      mutation.value,
      getTask(mutation.key),
      mutation.originalAttachmentIds,
    ),
  );
  yield* validateAttachments(task).pipe(
    Effect.mapError((error) => new SyncProtocolError({ message: error.message })),
  );
  if (task.id !== mutation.key) {
    return yield* new SyncProtocolError({ message: "Task mutation key does not match value" });
  }
  return {
    collection: taskCollectionId,
    mutation: new Mutation({
      collection: mutation.collection,
      type: mutation.type,
      key: mutation.key,
      value: task,
    }),
    value: task,
  } satisfies PreparedMutation;
});
