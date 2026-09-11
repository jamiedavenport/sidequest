import { Effect, Schema } from "effect";
import type { BoardClient } from "~/board/sync/client-types";

type PrivacyClient = Pick<BoardClient, "lanes" | "offline">;

export class LanePrivacyError extends Schema.TaggedError<LanePrivacyError>()("LanePrivacyError", {
  cause: Schema.Defect(),
}) {}

export function isLanePrivate(client: Pick<BoardClient, "lanes">, laneId: string): boolean {
  return client.lanes.get(laneId)?.hidden === true;
}

export const setLanePrivacy = Effect.fn("setLanePrivacy")(function* (
  client: PrivacyClient,
  laneId: string,
  hidden: boolean,
) {
  yield* Effect.annotateCurrentSpan({ laneId, hidden });
  const transaction = yield* Effect.try({
    try: () => {
      const pending = client.offline.createOfflineTransaction({
        autoCommit: false,
        mutationFnName: "persistBoard",
      });
      pending.mutate(() => {
        client.lanes.update(laneId, (draft) => {
          draft.hidden = hidden;
        });
      });
      return pending;
    },
    catch: (cause) => new LanePrivacyError({ cause }),
  });
  yield* Effect.tryPromise({
    try: () => transaction.commit(),
    catch: (cause) => new LanePrivacyError({ cause }),
  });
});
