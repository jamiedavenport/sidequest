import { Effect } from "effect";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import { isSystemLane } from "~/board/views";
import { decodeLane } from "../codec";
import { laneCollectionId } from "../collections";
import type { PreparedMutation } from "./schema";

export const prepareLaneMutation = Effect.fn("prepareLaneMutation")(function* (mutation: Mutation) {
  if (mutation.type === "delete") {
    if (isSystemLane({ id: mutation.key })) {
      return yield* new SyncProtocolError({ message: "System lanes cannot be persisted" });
    }

    return { collection: laneCollectionId, mutation } satisfies PreparedMutation;
  }

  if (mutation.value === undefined) {
    // oxlint-disable-next-line typescript/consistent-return -- typed Effect failure
    return yield* new SyncProtocolError({ message: `Missing value for ${mutation.type}` });
  }

  const lane = yield* decodeLane(mutation.value);
  if (lane.id !== mutation.key) {
    return yield* new SyncProtocolError({
      message: "Lane mutation key does not match value",
    });
  }
  if (isSystemLane(lane)) {
    return yield* new SyncProtocolError({ message: "System lanes cannot be persisted" });
  }

  return {
    collection: laneCollectionId,
    mutation: new Mutation({
      collection: mutation.collection,
      type: mutation.type,
      key: mutation.key,
      value: lane,
    }),
    value: lane,
  } satisfies PreparedMutation;
});
