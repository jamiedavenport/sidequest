import { Effect, Schema } from "effect";
import { expect, it } from "vitest";

import { createDemoSeed } from "~/board/seeds/demo";
import { createOnboardingSeed } from "~/board/seeds/onboarding";
import { BoardSeed, validateBoardSeed } from "~/board/seeds/schema";
import { boardNeedsNormalize, projectTasksForView, systemLanes } from "~/board/views";

it("builds fresh deterministic fixtures with valid counts, notes, whiteboards and nested placement", () => {
  const demo = createDemoSeed({ anchorDate: "2026-12-30" });
  const onboarding = createOnboardingSeed();
  expect(demo).toEqual(createDemoSeed({ anchorDate: "2026-12-30" }));
  expect(onboarding).toEqual(createOnboardingSeed());
  expect(demo.tasks).toHaveLength(40);
  expect(demo.tasks.filter((task) => task.parentId)).toHaveLength(10);
  expect(demo.tasks.filter((task) => task.completed)).toHaveLength(8);
  expect(demo.notes.filter((note) => note.content.content[0]?.content?.length)).toHaveLength(6);
  expect(demo.tasks.flatMap((task) => task.attachments ?? [])).toHaveLength(3);
  expect(demo.whiteboards).toHaveLength(1);
  expect(demo.tasks.find((task) => task.id === "demo-weekend-trip")?.date).toBe("2027-01-04");
  expect(onboarding.tasks).toHaveLength(7);
  expect(onboarding.tasks.every((task) => !task.completed)).toBe(true);
  for (const seed of [demo, onboarding]) {
    expect(Schema.is(BoardSeed)(seed)).toBe(true);
    expect(boardNeedsNormalize([...systemLanes, ...seed.lanes], seed.tasks)).toBe(false);
    expect(seed.notes).toHaveLength(seed.tasks.length);
  }
  expect(
    projectTasksForView(demo.tasks).find((task) => task.id === "demo-smoke-test")?.visualDepth,
  ).toBe(2);
  expect(projectTasksForView(demo.tasks).some((task) => task.id === "demo-build-logs")).toBe(false);
  const fresh = createDemoSeed({ anchorDate: "2026-12-30" });
  expect(fresh.tasks[0]).not.toBe(demo.tasks[0]);
  expect(fresh.notes[0]?.content).not.toBe(demo.notes[0]?.content);
  expect(fresh.whiteboards[0]?.document.elements).not.toBe(demo.whiteboards[0]?.document.elements);
});

it("rejects malformed fixtures before persistence", () => {
  const seed = createOnboardingSeed();
  const first = seed.tasks[0]!;
  for (const invalid of [
    { ...seed, lanes: [...systemLanes, ...seed.lanes] },
    { ...seed, tasks: [...seed.tasks, first] },
    { ...seed, tasks: [{ ...first, laneId: "today" }, ...seed.tasks.slice(1)] },
    { ...seed, tasks: [{ ...first, parentId: first.id }, ...seed.tasks.slice(1)] },
    { ...seed, tasks: [{ ...first, parentId: "missing" }, ...seed.tasks.slice(1)] },
    {
      ...seed,
      tasks: seed.tasks.map((task) => (task.parentId ? { ...task, date: "2026-01-01" } : task)),
    },
    { ...seed, notes: [] },
    { ...seed, whiteboards: [{ taskId: first.id, document: {} }] },
  ]) {
    expect(Effect.runSync(Effect.flip(validateBoardSeed(invalid)))._tag).toBe("BoardSeedError");
  }
  expect(() => createDemoSeed({ anchorDate: "2026-02-30" })).toThrow();
});
