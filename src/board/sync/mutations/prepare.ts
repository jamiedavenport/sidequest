import { Effect } from "effect";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import type { AttachmentStore } from "~/board/attachments/store";
import type { Lane, Task } from "~/board/schema";
import {
  laneCollectionId,
  taskCollectionId,
  noteCollectionId,
  whiteboardCollectionId,
} from "../collections";
import { logBoardSync, mutationTelemetry } from "../telemetry";
import { prepareLaneMutation } from "./lanes";
import { prepareTaskMutation } from "./tasks";
import { prepareNoteMutation, prepareWhiteboardMutation } from "./documents";
import type { GetTask, PreparedMutation } from "./schema";

const prepareDocumentMutation = Effect.fn("prepareDocumentMutation")(function* (
  mutation: Mutation,
  getTask: GetTask,
  getLane: (id: string) => Lane | undefined,
) {
  switch (mutation.collection) {
    case laneCollectionId:
      return yield* prepareLaneMutation(mutation, getLane(mutation.key));
    case noteCollectionId:
      return yield* prepareNoteMutation(mutation, getTask);
    case whiteboardCollectionId:
      return yield* prepareWhiteboardMutation(mutation, getTask);
    default:
      return yield* new SyncProtocolError({
        message: `Unknown board collection ${mutation.collection}`,
      });
  }
});

export const prepareMutations = Effect.fn("prepareMutations")(
  function* (
    mutations: ReadonlyArray<Mutation>,
    getTask: GetTask,
    validateAttachments: OmitThisParameter<AttachmentStore["validateAttachments"]>,
    getLane: (id: string) => Lane | undefined,
  ) {
    const startedAt = Date.now();
    yield* Effect.annotateCurrentSpan(mutationTelemetry(mutations));
    const prepared = new Map<number, PreparedMutation>();
    const pendingTasks = new Map<string, Task | undefined>();
    // Validate tasks first so document writes see the task state from this batch.
    yield* Effect.forEach(
      mutations,
      (mutation, index) =>
        Effect.gen(function* () {
          if (mutation.collection !== taskCollectionId) {
            return;
          }
          const task = yield* prepareTaskMutation(mutation, getTask, validateAttachments);
          prepared.set(index, task);
          pendingTasks.set(mutation.key, task.value);
        }),
      { discard: true },
    );
    const getPendingTask: GetTask = (id) =>
      pendingTasks.has(id) ? pendingTasks.get(id) : getTask(id);
    const pendingLanes = new Map<string, Lane | undefined>();
    const getPendingLane = (id: string) =>
      pendingLanes.has(id) ? pendingLanes.get(id) : getLane(id);
    const applied = yield* Effect.forEach(
      mutations,
      Effect.fn(function* (mutation, index) {
        const task = prepared.get(index);
        if (task) {
          return task;
        }
        const document = yield* prepareDocumentMutation(mutation, getPendingTask, getPendingLane);
        if (document.collection === laneCollectionId) {
          pendingLanes.set(mutation.key, document.value);
        }
        return document;
      }),
    );
    yield* logBoardSync("mutations_prepared", {
      durationMs: Date.now() - startedAt,
      outcome: "success",
      ...mutationTelemetry(mutations),
    });
    return applied;
  },
  Effect.mapError((error) => new SyncProtocolError({ message: error.message })),
);
