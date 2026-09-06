import { Schema } from "effect";
import { Lane, Task } from "~/board/schema";
import type { BoardGraph } from "./graph";

export const TaskRef = Schema.Struct({ viewId: Schema.String, taskId: Schema.String });
export type TaskRef = typeof TaskRef.Type;

export const DetailTab = Schema.Literals(["notes", "whiteboard"]);
export type DetailTab = typeof DetailTab.Type;

const selection = Schema.TaggedUnion({
  Lane: { viewId: Schema.String },
  Task: { target: TaskRef },
});

export const Selection = Object.assign(selection, {
  Lane: selection.cases.Lane.make.bind(selection.cases.Lane),
  Task: selection.cases.Task.make.bind(selection.cases.Task),
});
export type Selection = typeof Selection.Type;

const dragSource = Schema.TaggedUnion({
  Lane: { viewId: Schema.String },
  Task: { target: TaskRef },
});

export const DragSource = Object.assign(dragSource, {
  Lane: dragSource.cases.Lane.make.bind(dragSource.cases.Lane),
  Task: dragSource.cases.Task.make.bind(dragSource.cases.Task),
});
export type DragSource = typeof DragSource.Type;

const interaction = Schema.TaggedUnion({
  Navigating: { selection: Selection },
  Adding: { selection: Selection },
  Editing: { target: TaskRef },
  Details: { target: TaskRef, tab: DetailTab },
  Dragging: { selection: Selection, source: DragSource },
});

export const Interaction = Object.assign(interaction, {
  Navigating: interaction.cases.Navigating.make.bind(interaction.cases.Navigating),
  Adding: interaction.cases.Adding.make.bind(interaction.cases.Adding),
  Editing: interaction.cases.Editing.make.bind(interaction.cases.Editing),
  Details: interaction.cases.Details.make.bind(interaction.cases.Details),
  Dragging: interaction.cases.Dragging.make.bind(interaction.cases.Dragging),
});
export type Interaction = typeof Interaction.Type;

const BoardLane = Schema.Struct({
  ...Lane.fields,
  tasks: Schema.Array(Schema.Struct({ ...Task.fields, visualDepth: Schema.Number })),
});

const event = Schema.TaggedUnion({
  BoardSync: { lanes: Schema.Array(BoardLane), tasks: Schema.Array(Task) },
  Navigate: { direction: Schema.Literals(["up", "down", "left", "right"]) },
  LaneSelect: { viewId: Schema.String },
  TaskSelect: { target: TaskRef },
  TaskCreated: { target: TaskRef },
  EditStart: { target: TaskRef },
  EditCancel: {},
  EditSave: {},
  DetailsOpen: { target: TaskRef, tab: DetailTab },
  DetailsTabSelect: { tab: DetailTab },
  DetailsClose: {},
  AddStart: { viewId: Schema.String },
  AddCancel: {},
  DragStart: { source: DragSource },
  DragFinish: { viewId: Schema.String },
  DragCancel: {},
});

export const BoardEvent = Object.assign(event, {
  BoardSync: event.cases.BoardSync.make.bind(event.cases.BoardSync),
  Navigate: event.cases.Navigate.make.bind(event.cases.Navigate),
  LaneSelect: event.cases.LaneSelect.make.bind(event.cases.LaneSelect),
  TaskSelect: event.cases.TaskSelect.make.bind(event.cases.TaskSelect),
  TaskCreated: event.cases.TaskCreated.make.bind(event.cases.TaskCreated),
  EditStart: event.cases.EditStart.make.bind(event.cases.EditStart),
  EditCancel: event.cases.EditCancel.make.bind(event.cases.EditCancel),
  EditSave: event.cases.EditSave.make.bind(event.cases.EditSave),
  DetailsOpen: event.cases.DetailsOpen.make.bind(event.cases.DetailsOpen),
  DetailsTabSelect: event.cases.DetailsTabSelect.make.bind(event.cases.DetailsTabSelect),
  DetailsClose: event.cases.DetailsClose.make.bind(event.cases.DetailsClose),
  AddStart: event.cases.AddStart.make.bind(event.cases.AddStart),
  AddCancel: event.cases.AddCancel.make.bind(event.cases.AddCancel),
  DragStart: event.cases.DragStart.make.bind(event.cases.DragStart),
  DragFinish: event.cases.DragFinish.make.bind(event.cases.DragFinish),
  DragCancel: event.cases.DragCancel.make.bind(event.cases.DragCancel),
});
export type BoardEvent = typeof BoardEvent.Type;

export type BoardContext = { readonly graph: BoardGraph; readonly interaction: Interaction };

export function selectionOf(value: Interaction): Selection {
  return "selection" in value ? value.selection : Selection.Task({ target: value.target });
}

export function viewIdOf(value: Selection): string {
  return value._tag === "Lane" ? value.viewId : value.target.viewId;
}

export function currentLaneId(context: BoardContext): string {
  return viewIdOf(selectionOf(context.interaction));
}

export function selectedTarget(context: BoardContext): TaskRef | undefined {
  const selected = selectionOf(context.interaction);
  return selected._tag === "Task" ? selected.target : undefined;
}

export function selectedTaskId(context: BoardContext): string | null {
  return selectedTarget(context)?.taskId ?? null;
}
