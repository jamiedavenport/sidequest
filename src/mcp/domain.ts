import { Schema } from "effect";
import { planTaskCreate, planTaskUpdate } from "~/board/data/task-planning";
import type { Lane, Task } from "~/board/schema";
import {
  boardViewIds,
  completeTaskAndDescendants,
  currentViewId,
  isTaskInView,
  planTaskDestination,
  systemLanes,
} from "~/board/views";
import {
  ToolError,
  toolInputs,
  type ToolInput,
  type ToolName,
  type ToolResult,
} from "~/mcp/schema";

export type BoardState = {
  revision?: number;
  lanes: ReadonlyArray<Lane>;
  tasks: ReadonlyArray<Task>;
};

export type CommandPlan = { tasks: ReadonlyArray<Task>; result: ToolResult };

export function decodeInput<K extends ToolName>(name: K, input: unknown): ToolInput<K> {
  try {
    return Schema.decodeUnknownSync(toolInputs[name], { onExcessProperty: "error" })(input);
  } catch {
    throw new ToolError({
      code: "invalid_input",
      message: `Invalid arguments for ${name}. See the tool input schema.`,
    });
  }
}

export function dateContext(timezone = "UTC", instant = new Date()) {
  let today: string;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    today = `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    throw new ToolError({ code: "invalid_input", message: "timezone must be an IANA timezone." });
  }
  // Existing view helpers parse legacy dates in local calendar time. Supply the selected civil day.
  return { today, now: new Date(`${today}T12:00:00`) };
}

function validateDate(value: string | null | undefined) {
  if (value == null) return;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ToolError({
      code: "invalid_input",
      message: "date must be a valid YYYY-MM-DD calendar date.",
    });
  }
}

function validateTitle(value: string | undefined) {
  if (value !== undefined && value.trim() === "")
    throw new ToolError({ code: "invalid_input", message: "Task titles cannot be blank." });
}

function requireTask(state: BoardState, id: string, active = false): Task {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new ToolError({ code: "not_found", message: "Task does not exist." });
  if (active && task.completed)
    throw new ToolError({ code: "completed_task", message: "Completed tasks cannot be changed." });
  return task;
}

function requireView(state: BoardState, id: string) {
  if (!boardViewIds(state.lanes).includes(id))
    throw new ToolError({ code: "not_found", message: "Destination view does not exist." });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export async function digest(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizedInput(name: ToolName, raw: unknown) {
  const input = decodeInput(name, raw);
  return {
    ...input,
    ...("title" in input && input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(["create_task", "move_task", "list_tasks", "search_tasks"].includes(name)
      ? { timezone: "timezone" in input ? (input.timezone ?? "UTC") : "UTC" }
      : {}),
    ...(name === "create_task"
      ? { viewId: "viewId" in input ? (input.viewId ?? "inbox") : "inbox" }
      : {}),
  };
}

const Cursor = Schema.Struct({
  fingerprint: Schema.String,
  offset: Schema.Int.check(Schema.isGreaterThan(0)),
});

async function paginate<T>(
  rows: ReadonlyArray<T>,
  filters: unknown,
  input: { limit?: number; cursor?: string },
) {
  const limit = input.limit ?? 50;
  const fingerprint = await digest({ filters, rows });
  let offset = 0;
  if (input.cursor !== undefined) {
    try {
      const cursor = Schema.decodeUnknownSync(Cursor)(JSON.parse(atob(input.cursor)));
      if (cursor.fingerprint !== fingerprint || cursor.offset >= rows.length)
        throw new Error("stale");
      offset = cursor.offset;
    } catch {
      throw new ToolError({
        code: "stale_cursor",
        message: "Cursor is invalid or results changed. Restart without a cursor.",
      });
    }
  }
  return {
    rows: rows.slice(offset, offset + limit),
    ...(offset + limit < rows.length
      ? { nextCursor: btoa(JSON.stringify({ fingerprint, offset: offset + limit })) }
      : {}),
  };
}

export async function queryBoard(
  state: BoardState,
  name: ToolName,
  raw: unknown,
  instant = new Date(),
): Promise<ToolResult> {
  if (name === "get_task") {
    const input = decodeInput(name, raw);
    const task = requireTask(state, input.taskId);
    const ancestors: Task[] = [];
    const seen = new Set([task.id]);
    let parentId = task.parentId;
    while (parentId !== undefined && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = state.tasks.find((t) => t.id === parentId);
      if (!parent) break;
      ancestors.unshift(parent);
      parentId = parent.parentId;
    }
    return { task, ancestors };
  }
  if (name === "list_lanes") {
    const input = decodeInput(name, raw);
    const search = input.search?.toLowerCase() ?? "";
    const lanes = [
      ...systemLanes,
      ...state.lanes
        .filter((l) => !systemLanes.some((s) => s.id === l.id))
        .toSorted((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)),
    ].filter((l) => l.title.toLowerCase().includes(search));
    const { rows, ...rest } = await paginate(
      lanes,
      { search, limit: input.limit ?? 50, revision: state.revision },
      input,
    );
    return { lanes: rows, ...rest };
  }
  if (name !== "list_tasks" && name !== "search_tasks")
    throw new ToolError({ code: "invalid_input", message: "Expected a read tool." });
  const input = decodeInput(name, raw);
  const { now, today } = dateContext(input.timezone, instant);
  if (input.viewId !== undefined) requireView(state, input.viewId);
  if (input.parentId != null) requireTask(state, input.parentId);
  const query = "query" in input ? input.query.toLowerCase() : "";
  const status = input.status ?? "active";
  const tasks = state.tasks
    .filter(
      (t) =>
        (status === "all" || t.completed === (status === "completed")) &&
        (input.viewId === undefined || isTaskInView(t, input.viewId, now)) &&
        (input.parentId === undefined || (t.parentId ?? null) === input.parentId) &&
        t.title.toLowerCase().includes(query),
    )
    .toSorted((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const { rows, ...rest } = await paginate(
    tasks,
    {
      name,
      revision: state.revision,
      query,
      status,
      viewId: input.viewId,
      parentId: input.parentId,
      today,
      timezone: input.timezone ?? "UTC",
      limit: input.limit ?? 50,
    },
    input,
  );
  return { tasks: rows, ...rest };
}

export function planCommand(
  state: BoardState,
  name: ToolName,
  raw: unknown,
  operationId: string,
  taskId: string = crypto.randomUUID(),
  instant = new Date(),
): CommandPlan {
  let task: Task;
  let changed: ReadonlyArray<Task>;
  if (name === "create_task") {
    const input = decodeInput(name, raw);
    validateTitle(input.title);
    validateDate(input.date);
    const { now, today } = dateContext(input.timezone, instant);
    const viewId = input.viewId ?? "inbox";
    requireView(state, viewId);
    task = planTaskCreate(state.tasks, { ...input, id: taskId, viewId }, now, today);
    if (input.parentId !== undefined) {
      const parent = requireTask(state, input.parentId, true);
      if (!isTaskInView(parent, viewId, now))
        throw new ToolError({
          code: "invalid_move",
          message: "Parent must belong to the destination view.",
        });
      task = { ...task, parentId: parent.id, laneId: parent.laneId, date: parent.date };
      if (input.date !== undefined) task = { ...task, date: input.date };
    }
    changed = [task];
  } else if (name === "update_task") {
    const input = decodeInput(name, raw);
    validateTitle(input.title);
    validateDate(input.date);
    task = planTaskUpdate(requireTask(state, input.taskId, true), input);
    changed = [task];
  } else if (name === "complete_task") {
    const input = decodeInput(name, raw);
    task = requireTask(state, input.taskId);
    const map = new Map(state.tasks.map((t) => [t.id, { ...t }]));
    changed = task.completed
      ? []
      : completeTaskAndDescendants(
          {
            toArray: state.tasks,
            has: (id) => map.has(id),
            get: (id) => map.get(id),
            update: (id, update) => {
              const draft = map.get(id);
              if (draft) update(draft);
            },
          },
          task.id,
        );
    task = map.get(task.id) ?? task;
  } else if (name === "move_task") {
    const input = decodeInput(name, raw);
    task = requireTask(state, input.taskId, true);
    requireView(state, input.destination.viewId);
    const { now, today } = dateContext(input.timezone, instant);
    const updates = planTaskDestination(
      state.tasks.filter((t) => !t.completed),
      task.id,
      input.sourceViewId ?? currentViewId(task, now),
      input.destination,
      now,
      today,
    );
    if (updates === undefined)
      throw new ToolError({
        code: "invalid_move",
        message: "Move target is missing, completed, outside its view, or would create a cycle.",
      });
    changed = updates.map((u) => ({ ...requireTask(state, u.taskId, true), ...u.patch }));
    task = changed.find((t) => t.id === task.id) ?? task;
  } else throw new ToolError({ code: "invalid_input", message: "Expected a write tool." });
  return {
    tasks: changed,
    result: { task, affectedTaskIds: changed.map((t) => t.id), operationId },
  };
}
