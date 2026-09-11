import { Effect } from "effect";
import { expect, it } from "vitest";
import { systemLanes } from "~/board/views";
import { Mutation } from "~/sync/protocol";
import { prepareLaneMutation } from "./lanes";
import { prepareMutations } from "./prepare";

it.each(systemLanes)("allows visibility changes but preserves the fixed $id lane", (lane) => {
  const update = (value: unknown) =>
    new Mutation({
      collection: "lanes",
      type: "update",
      key: lane.id,
      value,
    });
  const hidden = { ...lane, hidden: true };
  expect(Effect.runSync(prepareLaneMutation(update(hidden), lane)).value).toEqual(hidden);
  const invalid = [
    new Mutation({ collection: "lanes", type: "delete", key: lane.id }),
    ...[{ title: "Renamed" }, { colour: "blue" }, { shape: "diamond" }, { rank: 99 }].map((patch) =>
      update({ ...lane, ...patch }),
    ),
  ];
  for (const mutation of invalid) {
    expect(Effect.runSync(Effect.flip(prepareLaneMutation(mutation, lane)))._tag).toBe(
      "SyncProtocolError",
    );
  }
});

it("keeps saved visibility on legacy edits and uses explicit visibility from the same batch", () => {
  const lane = { ...systemLanes[0]!, id: "project", hidden: true };
  const { hidden: _hidden, ...legacy } = lane;
  const update = (value: unknown) =>
    new Mutation({
      collection: "lanes",
      type: "update",
      key: lane.id,
      value,
    });
  const prepared = Effect.runSync(
    prepareMutations(
      [
        update({ ...legacy, title: "Legacy edit" }),
        update({ ...lane, hidden: false }),
        update(legacy),
      ],
      () => undefined,
      () => Effect.void,
      () => lane,
    ),
  );
  expect(prepared.map((mutation) => mutation.value)).toEqual([
    { ...lane, title: "Legacy edit" },
    { ...lane, hidden: false },
    { ...lane, hidden: false },
  ]);
});
