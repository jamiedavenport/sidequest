import { planTaskUpdate } from "~/board/data/task-planning";
import { describe, expect, it } from "vitest";
import type { Task } from "~/board/schema";
import {
  dateContext,
  decodeInput,
  digest,
  normalizedInput,
  planCommand,
  queryBoard,
  type BoardState,
} from "~/mcp/domain";

const instant = new Date("2026-01-01T00:30:00Z");

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: id,
  rank: 0,
  completed: false,
  collapsed: false,
  ...patch,
});

const state = (tasks: Task[] = []): BoardState => ({
  lanes: [{ id: "work", title: "Work", rank: 0, colour: "blue", shape: "circle" }],
  tasks,
});

const write = { idempotencyKey: "test" };

function plan(board: BoardState, name: Parameters<typeof planCommand>[1], input: object) {
  return planCommand(board, name, { ...write, ...input }, "operation", "new-id", instant);
}

describe("MCP task domain", () => {
  it("defaults to Inbox and trims titles", () => {
    expect(plan(state(), "create_task", { title: "  first  " }).result.task).toEqual(
      task("new-id", { title: "first" }),
    );
  });
  it("preserves partial fields and attachments, clears dates, and reenriches changed titles", () => {
    const original = task("a", {
      date: "2026-01-02",
      attachments: [
        {
          id: "link",
          type: "link",
          label: "Link",
          meta: "",
          href: "https://example.com",
          mark: "",
        },
      ],
    });
    expect(plan(state([original]), "update_task", { taskId: "a" }).result.task).toEqual(original);
    expect(
      plan(state([original]), "update_task", { taskId: "a", date: null }).result.task,
    ).toMatchObject({ date: undefined, attachments: original.attachments });
    expect(
      plan(state([original]), "update_task", { taskId: "a", title: "changed" }).result.task,
    ).toMatchObject({ date: original.date, attachments: [] });
  });
  it.each(["", "  ", "\n"])("rejects blank title %j", (title) => {
    expect(() => plan(state(), "create_task", { title })).toThrow();
  });
  it.each(["2026-02-29", "2026-13-01", "Today", "2026-1-1"])("rejects invalid date %s", (date) => {
    expect(() => plan(state(), "create_task", { title: "a", date })).toThrow();
  });
  it("accepts leap days and uses UTC or explicit timezones at year boundaries", () => {
    expect(plan(state(), "create_task", { title: "a", date: "2028-02-29" }).result.task?.date).toBe(
      "2028-02-29",
    );
    expect(dateContext(undefined, instant).today).toBe("2026-01-01");
    expect(dateContext("America/Los_Angeles", instant).today).toBe("2025-12-31");
    expect(() => dateContext("Nowhere/Unknown", instant)).toThrow();
    expect(
      plan(state(), "create_task", { title: "a", viewId: "today", timezone: "America/Los_Angeles" })
        .result.task?.date,
    ).toBe("2025-12-31");
  });
  it("moves Today/Inbox using full dates and keeps custom-lane dates", () => {
    const move = (viewId: string) =>
      plan(state([task("a", { date: "2027-02-01", laneId: "work" })]), "move_task", {
        taskId: "a",
        destination: { viewId, edge: "append" },
      }).result.task;
    expect(move("today")).toMatchObject({ date: "2026-01-01", laneId: undefined });
    expect(move("inbox")).toMatchObject({ date: undefined, laneId: undefined });
    expect(move("work")?.date).toBe("2027-02-01");
  });
  it("nests a subtree, rejects cycles and missing or completed destinations", () => {
    const board = state([
      task("a"),
      task("b", { parentId: "a", rank: 1 }),
      task("c", { laneId: "work", date: "2026-02-01", rank: 2 }),
    ]);
    const moved = plan(board, "move_task", {
      taskId: "a",
      destination: { viewId: "work", edge: "nest", taskId: "c" },
    });
    expect(moved.result.task).toMatchObject({ parentId: "c", laneId: "work", date: "2026-02-01" });
    expect(moved.tasks.find((t) => t.id === "b")).toMatchObject({
      parentId: "a",
      laneId: "work",
      date: "2026-02-01",
    });
    expect(() =>
      plan(board, "move_task", {
        taskId: "a",
        destination: { viewId: "inbox", edge: "nest", taskId: "b" },
      }),
    ).toThrow();
    expect(() => plan(board, "create_task", { title: "x", viewId: "missing" })).toThrow();
    expect(() =>
      plan(state([task("a", { completed: true })]), "update_task", { taskId: "a", title: "x" }),
    ).toThrow();
  });
  it("completes current descendants, preserving data, with repeated completion a no-op", () => {
    const board = state([
      task("a"),
      task("b", { parentId: "a" }),
      task("c", { parentId: "b" }),
      task("unrelated"),
    ]);
    const result = plan(board, "complete_task", { taskId: "a" });
    expect(result.result.affectedTaskIds).toEqual(["a", "b", "c"]);
    expect(result.tasks.every((t) => t.completed)).toBe(true);
    expect(plan(state([...result.tasks]), "complete_task", { taskId: "a" }).tasks).toEqual([]);
  });
  it("filters active, completed, root and nested tasks with legacy Today dates", async () => {
    const board = state([
      task("a", { date: "Today" }),
      task("b", { date: "1 Jan", parentId: "a" }),
      task("c", { completed: true }),
      task("d", { date: "2025-01-01" }),
    ]);
    expect(
      (await queryBoard(board, "list_tasks", { viewId: "today" }, instant)).tasks?.map((t) => t.id),
    ).toEqual(["a", "b"]);
    expect(
      (await queryBoard(board, "list_tasks", { parentId: null }, instant)).tasks?.map((t) => t.id),
    ).toEqual(["a", "d"]);
    expect(
      (await queryBoard(board, "list_tasks", { status: "completed" }, instant)).tasks?.map(
        (t) => t.id,
      ),
    ).toEqual(["c"]);
    expect(
      (await queryBoard(board, "get_task", { taskId: "b" })).ancestors?.map((t) => t.id),
    ).toEqual(["a"]);
  });
  it("paginates deterministic results and rejects changed filters or rows", async () => {
    const board = state(
      Array.from({ length: 110 }, (_, i) =>
        task(String(i).padStart(3, "0"), { title: `Task ${i}` }),
      ),
    );
    const first = await queryBoard(board, "search_tasks", { query: "TASK" }, instant);
    expect(first.tasks).toHaveLength(50);
    const second = await queryBoard(
      board,
      "search_tasks",
      { query: "TASK", cursor: first.nextCursor },
      instant,
    );
    expect(second.tasks?.[0]?.id).toBe("050");
    await expect(
      queryBoard(board, "search_tasks", { query: "different", cursor: first.nextCursor }, instant),
    ).rejects.toThrow();
    await expect(
      queryBoard(
        { ...board, tasks: board.tasks.slice(1) },
        "search_tasks",
        { query: "TASK", cursor: first.nextCursor },
        instant,
      ),
    ).rejects.toThrow();
    expect(() => decodeInput("list_tasks", { limit: 101 })).toThrow();
  });
  it("rejects a cursor when the board revision changed even if rows are identical", async () => {
    const board = { ...state([task("a"), task("b")]), revision: 1 };
    const page = await queryBoard(board, "list_tasks", { limit: 1 }, instant);
    await expect(
      queryBoard(
        { ...board, revision: 2 },
        "list_tasks",
        { limit: 1, cursor: page.nextCursor },
        instant,
      ),
    ).rejects.toMatchObject({ code: "stale_cursor" });
  });

  it("rejects identity injection and hashes normalized arguments", async () => {
    expect(() => decodeInput("get_task", { taskId: "a", userId: "other" })).toThrow();
    expect(await digest(normalizedInput("create_task", { ...write, title: " a " }))).toBe(
      await digest(
        normalizedInput("create_task", { ...write, title: "a", timezone: "UTC", viewId: "inbox" }),
      ),
    );
  });
});

it("preserves uploaded media and manually attached links when changing a task title", () => {
  const attachments = [
    {
      id: "photo",
      type: "image" as const,
      filename: "photo.png",
      mimeType: "image/png",
      size: 100,
    },
    {
      id: "manual",
      type: "link" as const,
      source: "manual" as const,
      href: "https://example.com/",
      label: "Example",
      meta: "Example",
      mark: "E",
    },
  ];
  expect(
    planTaskUpdate(
      { id: "task", title: "Old", rank: 0, completed: false, collapsed: false, attachments },
      { title: "New" },
    ).attachments,
  ).toEqual(attachments);
});
