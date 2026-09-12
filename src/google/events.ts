import { DateTime } from "effect";
import { isCanonicalTaskDate } from "~/board/date";
import type { Lane, Task } from "~/board/schema";
import type { CalendarEvent } from "./schema";

export type CalendarBoard = { tasks: ReadonlyArray<Task>; lanes: ReadonlyArray<Lane> };

function taskPath(task: Task, tasks: Map<string, Task>, lanes: Map<string, Lane>): string {
  const titles = [task.title];
  const seen = new Set([task.id]);
  let parentId = task.parentId;
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = tasks.get(parentId);
    if (!parent) {
      break;
    }
    titles.unshift(parent.title);
    parentId = parent.parentId;
  }
  titles.unshift(lanes.get(task.laneId ?? "")?.title ?? "Inbox");
  return titles.map((title) => title.replace(/[\r\n]+/g, " ")).join(" > ");
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function buildCalendarEvents(board: CalendarBoard): Map<string, CalendarEvent> {
  const tasks = new Map(board.tasks.map((task) => [task.id, task]));
  const lanes = new Map(board.lanes.map((lane) => [lane.id, lane]));
  const dates = new Map<string, { id: string; path: string }[]>();
  for (const task of board.tasks) {
    if (task.completed || task.date === undefined || !isCanonicalTaskDate(task.date)) {
      continue;
    }
    const group = dates.get(task.date) ?? [];
    group.push({ id: task.id, path: taskPath(task, tasks, lanes) });
    dates.set(task.date, group);
  }
  return new Map(
    [...dates]
      .toSorted(([a], [b]) => compareText(a, b))
      .map(([date, paths]) => [
        date,
        {
          summary: "🗓️ Sidequest",
          description: paths
            .toSorted((a, b) => a.path.localeCompare(b.path, "en") || compareText(a.id, b.id))
            .map(({ path }) => `• ${path}`)
            .join("\n"),
          start: { date },
          end: {
            date: DateTime.formatIsoDateUtc(DateTime.add(DateTime.makeUnsafe(date), { days: 1 })),
          },
          transparency: "transparent",
          reminders: { useDefault: false },
        },
      ]),
  );
}

export function sameCalendarEvent(left: CalendarEvent | null, right: CalendarEvent): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}
