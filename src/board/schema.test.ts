import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { Task } from "~/board/schema";

const legacyTask = {
  id: "task",
  title: "Legacy task",
  rank: 0,
  completed: false,
};

describe("Task schema migration", () => {
  it("decodes a legacy task with collapsed=false", () => {
    expect(Schema.decodeUnknownSync(Task)(legacyTask)).toEqual({
      ...legacyTask,
      collapsed: false,
    });
  });

  it("encodes the required collapse state", () => {
    const task = Schema.decodeUnknownSync(Task)(legacyTask);

    expect(Schema.encodeSync(Task)(task)).toEqual({ ...legacyTask, collapsed: false });
  });
});
