import { expect, it } from "vitest";
import type { Lane, Task } from "~/board/schema";
import { buildCalendarEvents } from "./events";

const lane: Lane = {
  id: "lane",
  title: "Sidequest",
  colour: "blue",
  shape: "circle",
  rank: 0,
  hidden: false,
};

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: id,
  rank: 0,
  completed: false,
  collapsed: false,
  laneId: "lane",
  ...patch,
});

it("groups incomplete tasks by their own dates, including past dates, with sorted full paths", () => {
  const tasks = [
    task("website", { title: "Website", date: "2025-12-31" }),
    task("pricing", {
      title: "Update pricing",
      parentId: "website",
      date: "2025-12-31",
    }),
    task("ship", { title: "Ship Google Integration", date: "2025-12-31" }),
    task("completed", { date: "2025-12-31", completed: true }),
    task("completed-only-date", { date: "2026-09-12", completed: true }),
    task("undated", { parentId: "website" }),
    task("unknown", { date: "Today" }),
    task("inbox", { laneId: undefined, date: "2028-02-29" }),
  ];
  const events = buildCalendarEvents({ lanes: [lane], tasks });
  expect(events.size).toBe(2);
  expect(events.get("2025-12-31")).toEqual({
    summary: "🗓️ Sidequest",
    description:
      "• Sidequest > Ship Google Integration\n• Sidequest > Website\n• Sidequest > Website > Update pricing",
    start: { date: "2025-12-31" },
    end: { date: "2026-01-01" },
    transparency: "transparent",
    reminders: { useDefault: false },
  });
  expect(events.get("2028-02-29")).toMatchObject({
    description: "• Inbox > inbox",
    end: { date: "2028-03-01" },
  });
  expect(
    buildCalendarEvents({
      lanes: [lane],
      tasks: tasks.map((t) => ({ ...t, completed: true })),
    }).size,
  ).toBe(0);
  expect(buildCalendarEvents({ lanes: [lane], tasks: [...tasks].toReversed() })).toEqual(events);
});
