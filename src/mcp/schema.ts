import { TaskDate } from "~/board/date";
import { Schema } from "effect";
import { Lane, Task } from "~/board/schema";

const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200));

const Title = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(10000));

const page = {
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4000))),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
};

const context = { timezone: Schema.optionalKey(Id) };

const filters = {
  ...page,
  ...context,
  viewId: Schema.optionalKey(Id),
  parentId: Schema.optionalKey(Schema.NullOr(Id)),
  status: Schema.optionalKey(Schema.Literals(["active", "completed", "all"])),
};

const write = { idempotencyKey: Id };

const Destination = Schema.Union([
  Schema.Struct({ viewId: Id, edge: Schema.Literal("append") }),
  Schema.Struct({ viewId: Id, taskId: Id, edge: Schema.Literals(["before", "after", "nest"]) }),
]);

export const toolInputs = {
  list_lanes: Schema.Struct({ ...page, search: Schema.optionalKey(Title) }),
  list_tasks: Schema.Struct(filters),
  search_tasks: Schema.Struct({ ...filters, query: Title }),
  get_task: Schema.Struct({ taskId: Id }),
  create_task: Schema.Struct({
    ...write,
    ...context,
    title: Title,
    viewId: Schema.optionalKey(Id),
    parentId: Schema.optionalKey(Id),
    date: Schema.optionalKey(TaskDate),
  }),
  update_task: Schema.Struct({
    ...write,
    taskId: Id,
    title: Schema.optionalKey(Title),
    date: Schema.optionalKey(Schema.NullOr(TaskDate)),
  }),
  move_task: Schema.Struct({
    ...write,
    ...context,
    taskId: Id,
    sourceViewId: Schema.optionalKey(Id),
    destination: Destination,
  }),
  complete_task: Schema.Struct({ ...write, taskId: Id }),
};

export type ToolName = keyof typeof toolInputs;

export type ToolInput<K extends ToolName> = (typeof toolInputs)[K]["Type"];

export class ToolError extends Schema.TaggedError<ToolError>()("ToolError", {
  code: Schema.Literals([
    "invalid_input",
    "not_found",
    "invalid_move",
    "completed_task",
    "idempotency_conflict",
    "stale_cursor",
    "internal_error",
    "billing_required",
  ]),
  message: Schema.String,
}) {}

export const ToolResult = Schema.Struct({
  task: Schema.optionalKey(Task),
  tasks: Schema.optionalKey(Schema.Array(Task)),
  lanes: Schema.optionalKey(Schema.Array(Lane)),
  ancestors: Schema.optionalKey(Schema.Array(Task)),
  nextCursor: Schema.optionalKey(Schema.String),
  affectedTaskIds: Schema.optionalKey(Schema.Array(Schema.String)),
  operationId: Schema.optionalKey(Schema.String),
});
export type ToolResult = typeof ToolResult.Type;

export const ToolReply = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), result: ToolResult, replay: Schema.Boolean }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Struct({ code: ToolError.fields.code, message: Schema.String }),
  }),
]);
export type ToolReply = typeof ToolReply.Type;

export function isWriteTool(name: ToolName): boolean {
  return ["create_task", "update_task", "move_task", "complete_task"].includes(name);
}

export const toolNames = [
  "list_lanes",
  "list_tasks",
  "search_tasks",
  "get_task",
  "create_task",
  "update_task",
  "move_task",
  "complete_task",
] as const satisfies ReadonlyArray<ToolName>;

export const isToolName = Schema.is(Schema.Literals(toolNames));

export const ToolOutput = Schema.Union([
  ToolResult,
  Schema.Struct({ error: Schema.Struct({ code: ToolError.fields.code, message: Schema.String }) }),
]);
