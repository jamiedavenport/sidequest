import { Effect } from "effect";
import type { Lane } from "~/board/schema";
import { isSystemLane, systemLanes } from "~/board/views";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import { decodeLaneMutation } from "../codec";
import { laneCollectionId } from "../collections";
import type { PreparedMutation } from "./schema";

export const prepareLaneMutation = Effect.fn("prepareLaneMutation")(function* (
  mutation: Mutation,
  existing: Lane | undefined,
) {
  if (mutation.type === "delete") {
    if (isSystemLane({ id: mutation.key })) {
      return yield* new SyncProtocolError({ message: "System lanes cannot be deleted" });
    }
    return { collection: laneCollectionId, mutation } satisfies PreparedMutation;
  }

  if (mutation.value === undefined) {
    // oxlint-disable-next-line typescript/consistent-return -- typed Effect failure
    return yield* new SyncProtocolError({ message: `Missing value for ${mutation.type}` });
  }

  const lane = yield* decodeLaneMutation(mutation.value, existing);
  if (lane.id !== mutation.key) {
    return yield* new SyncProtocolError({
      message: "Lane mutation key does not match value",
    });
  }
  const system = systemLanes.find((candidate) => candidate.id === lane.id);
  if (
    system !== undefined &&
    (lane.title !== system.title ||
      lane.colour !== system.colour ||
      lane.shape !== system.shape ||
      lane.rank !== system.rank)
  ) {
    return yield* new SyncProtocolError({ message: "Only system lane visibility can be changed" });
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
