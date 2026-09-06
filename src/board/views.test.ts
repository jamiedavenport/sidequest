import { describe, expect, it } from "vitest";

import type { Task } from "~/board/types";
import { projectTasksForView } from "~/board/views";

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
