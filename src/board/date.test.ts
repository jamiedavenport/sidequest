import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { convertLegacyTaskDate, parseTaskDate, serializeTaskDate, TaskDate } from "./date";
import { placementForCreate } from "./views";
import { prepareTaskMutation } from "./sync/mutations/tasks";
import { Mutation } from "~/sync/protocol";
import type { Task } from "./schema";

const reference = new Date(2026, 8, 12, 23, 30);

it("stores a local calendar date from forms and Today placement", () => {
  expect(serializeTaskDate(reference)).toBe("2026-09-12");
  expect(placementForCreate("today", undefined, reference)).toEqual({ date: "2026-09-12" });
  expect(serializeTaskDate(parseTaskDate("2025-12-31", reference)!)).toBe("2025-12-31");
});

it("converts legacy dates with the browser reference while preserving canonical and unknown values", () => {
  expect(convertLegacyTaskDate("Today", reference)).toBe("2026-09-12");
  expect(convertLegacyTaskDate("12 Sep", reference)).toBe("2026-09-12");
  expect(convertLegacyTaskDate("1 Jan", reference)).toBe("2026-01-01");
  expect(convertLegacyTaskDate("2025-12-31", reference)).toBe("2025-12-31");
  expect(convertLegacyTaskDate("Tomorrow", reference)).toBe("Tomorrow");
});

describe("date mutation validation", () => {
  const task: Task = { id: "a", title: "Task", rank: 0, completed: false, collapsed: false };
  const prepare = (date: string, previous?: Task) =>
    Effect.runPromise(
      prepareTaskMutation(
        new Mutation({
          collection: "tasks",
          type: previous ? "update" : "insert",
          key: task.id,
          value: { ...task, date },
        }),
        () => previous,
        () => Effect.void,
      ),
    );
  it.each(["Today", "12 Sep", "2026-02-29", "2026-1-01", "2026-13-01"])(
    "rejects newly written invalid dates: %s",
    async (date) => {
      expect(Schema.is(TaskDate)(date)).toBe(false);
      await expect(prepare(date)).rejects.toThrow("YYYY-MM-DD");
    },
  );
  it("accepts leap days and leaves unchanged unparseable legacy dates editable", async () => {
    await expect(prepare("2028-02-29")).resolves.toHaveProperty("value.date", "2028-02-29");
    await expect(prepare("unparseable", { ...task, date: "unparseable" })).resolves.toHaveProperty(
      "value.date",
      "unparseable",
    );
  });
});
