import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decodeTaskMutation } from "~/board/sync/codec";
import type { Task } from "~/board/types";

const existing: Task = {
  id: "task",
  title: "Task",
  rank: 0,
  completed: false,
  collapsed: true,
};

describe("decodeTaskMutation", () => {
  it("preserves collapse state when a legacy update omits the property", () => {
    const decoded = Effect.runSync(
      decodeTaskMutation(
        {
          id: "task",
          title: "Updated task",
          rank: 0,
          completed: false,
        },
        existing,
      ),
    );

    expect(decoded.collapsed).toBe(true);
  });

  it("accepts an explicit collapse value from a current client", () => {
    const decoded = Effect.runSync(decodeTaskMutation({ ...existing, collapsed: false }, existing));

    expect(decoded.collapsed).toBe(false);
  });
});
