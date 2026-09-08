// Each assertion changes the same simulated board before the next check.
// oxlint-disable eslint/no-await-in-loop
import { Effect } from "effect";
import { expect, it, vi } from "vitest";
import { createOnboardingSeed } from "~/board/seeds/onboarding";
import { persistBoardSeed } from "~/board/seeds/persist";

it("awaits each collection in order and refuses to seed over any existing board data", async () => {
  const order: string[] = [];
  const collection = (name: string) => ({
    size: 0,
    insert: vi.fn(() => ({
      isPersisted: {
        promise: Promise.resolve().then(() => {
          order.push(name);
        }),
      },
    })),
  });
  const collections = {
    lanes: collection("lanes"),
    tasks: collection("tasks"),
    notes: collection("notes"),
    whiteboards: collection("whiteboards"),
  };
  const seed = createOnboardingSeed();
  expect(await Effect.runPromise(persistBoardSeed(collections, seed))).toBe(true);
  expect(order).toEqual(["lanes", "tasks", "notes"]);
  for (const stored of Object.values(collections)) {
    stored.size = 1;
    expect(await Effect.runPromise(persistBoardSeed(collections, seed))).toBe(false);
    stored.size = 0;
  }
  expect(order).toEqual(["lanes", "tasks", "notes"]);
});
