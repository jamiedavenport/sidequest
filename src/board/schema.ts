import { Schema } from "effect";
import type { StandardSchemaV1 } from "effect/StandardSchema";

export const LaneSymbolColour = Schema.Literals(["green", "amber", "blue", "violet"]);
export type LaneSymbolColour = typeof LaneSymbolColour.Type;

export const LaneSymbolShape = Schema.Literals(["square", "circle", "diamond"]);
export type LaneSymbolShape = typeof LaneSymbolShape.Type;

export const Attachment = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("link"),
  label: Schema.String,
  meta: Schema.String,
  href: Schema.String,
  mark: Schema.String,
  stat: Schema.optionalKey(Schema.String),
});
export type Attachment = typeof Attachment.Type;

export const Lane = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  caption: Schema.String,
  colour: LaneSymbolColour,
  shape: LaneSymbolShape,
  rank: Schema.Number,
});
export type Lane = typeof Lane.Type;

export const Task = Schema.Struct({
  id: Schema.String,
  laneId: Schema.optionalKey(Schema.String),
  parentId: Schema.optionalKey(Schema.String),
  title: Schema.String,
  rank: Schema.Number,
  completed: Schema.Boolean,
  date: Schema.optionalKey(Schema.String),
  attachments: Schema.optionalKey(Schema.Array(Attachment)),
});
export type Task = typeof Task.Type;

export type BoardTask = Task & {
  visualDepth: number;
};

export type BoardLane = Lane & {
  tasks: ReadonlyArray<BoardTask>;
};

export const laneSchema: StandardSchemaV1<Lane, Lane> = Schema.toStandardSchemaV1(Lane);
export const taskSchema: StandardSchemaV1<Task, Task> = Schema.toStandardSchemaV1(Task);
