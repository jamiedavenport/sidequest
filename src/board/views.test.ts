import { describe, expect, it } from "vitest";

import { initializeLanes } from "~/board/data/lanes";
import type { Task } from "~/board/types";
import {
  boardNeedsNormalize,
  normalizeStoredBoard,
  projectTasksForView,
  systemLanes,
} from "~/board/views";

function task(id: string, rank: number, input: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    rank,
    completed: false,
    collapsed: false,
    ...input,
  };
}

describe("projectTasksForView", () => {
  it("hides every descendant of a collapsed task while leaving siblings visible", () => {
    const tasks = [
      task("root", 0, { collapsed: true }),
      task("child", 1, { parentId: "root" }),
      task("grandchild", 2, { parentId: "child" }),
      task("sibling", 3),
    ];

    expect(projectTasksForView(tasks).map(({ id }) => id)).toEqual(["root", "sibling"]);
    expect(projectTasksForView(tasks)[0]).toMatchObject({
      id: "root",
      visualDepth: 0,
    });
  });

  it("preserves a nested collapsed branch when its ancestor is expanded", () => {
    const tasks = [
      task("root", 0),
      task("child", 1, { parentId: "root", collapsed: true }),
      task("grandchild", 2, { parentId: "child" }),
      task("other-child", 3, { parentId: "root" }),
    ];

    expect(projectTasksForView(tasks).map(({ id }) => id)).toEqual([
      "root",
      "child",
      "other-child",
    ]);
  });

  it("terminates malformed parent cycles without hiding unrelated tasks", () => {
    const tasks = [
      task("first", 0, { parentId: "second" }),
      task("second", 1, { parentId: "first" }),
      task("unrelated", 2),
    ];

    expect(projectTasksForView(tasks).map(({ id }) => id)).toEqual([
      "first",
      "second",
      "unrelated",
    ]);
  });
});

it("persists missing default lanes without deleting their privacy or resetting existing lanes", () => {
  const today = { ...systemLanes[0]!, hidden: true };
  const project = { ...systemLanes[1]!, id: "project" };
  Reflect.deleteProperty(project, "hidden");
  const lanes = [today, project];
  const tasks = [task("legacy-inbox-task", 0, { laneId: "inbox" })];
  const collections = {
    lanes: {
      toArray: lanes,
      has: (id: string) => lanes.some((lane) => lane.id === id),
      insert: (lane: typeof today) => {
        lanes.push({ ...lane });
      },
      update: (id: string, update: (draft: typeof today) => void) => {
        update(lanes.find((lane) => lane.id === id)!);
      },
    },
    tasks: {
      toArray: tasks,
      get: (id: string) => tasks.find((item) => item.id === id),
      update: (id: string, update: (draft: Task) => void) => {
        update(tasks.find((item) => item.id === id)!);
      },
    },
  };
  expect(boardNeedsNormalize(lanes, tasks)).toBe(true);
  expect(initializeLanes(collections.lanes)).toBe(true);
  expect(normalizeStoredBoard(collections)).toBe(true);
  expect(lanes).toEqual([today, { ...project, hidden: false }, systemLanes[1]]);
  expect(today.hidden).toBe(true);
  expect(tasks[0]?.laneId).toBeUndefined();
  expect(boardNeedsNormalize(lanes, tasks)).toBe(false);
  expect(normalizeStoredBoard(collections)).toBe(false);
  expect(initializeLanes(collections.lanes)).toBe(false);
});
