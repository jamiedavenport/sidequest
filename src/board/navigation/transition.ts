import { Effect } from "effect";
import {
  finishDrag,
  leaveAdding,
  navigate,
  openDetails,
  selectLane,
  startAdding,
  startDrag,
  syncBoard,
} from "./commands";
import { BoardEvent, Interaction, Selection, selectionOf, type BoardContext } from "./model";

// Sync is accepted centrally in every mode. All other events are opt-in.
const allowedEvents: Record<Interaction["_tag"], readonly BoardEvent["_tag"][]> = {
  Navigating: [
    "Navigate",
    "LaneSelect",
    "TaskSelect",
    "EditStart",
    "DetailsOpen",
    "AddStart",
    "DragStart",
  ],
  Adding: [
    "Navigate",
    "AddCancel",
    "AddStart",
    "EditStart",
    "LaneSelect",
    "TaskSelect",
    "TaskCreated",
  ],
  Editing: ["EditStart", "EditCancel", "EditSave", "TaskSelect", "LaneSelect", "AddStart"],
  Details: ["DetailsOpen", "DetailsTabSelect", "DetailsClose"],
  Dragging: ["DragFinish", "DragCancel"],
};

export const transition = Effect.fn("transition")(function* (
  context: BoardContext,
  event: BoardEvent,
): Effect.fn.Return<BoardContext> {
  if (event._tag === "BoardSync") {
    return yield* syncBoard(context, event);
  }
  const previous = context.interaction;
  if (!allowedEvents[previous._tag].includes(event._tag)) {
    return context;
  }
  const exit = () => Effect.succeed(Interaction.Navigating({ selection: selectionOf(previous) }));
  const interaction = yield* BoardEvent.match(event, {
    BoardSync: () => Effect.succeed(previous),
    Navigate: ({ direction }) =>
      previous._tag === "Adding"
        ? direction === "up"
          ? leaveAdding(context)
          : Effect.succeed(previous)
        : navigate(context, direction),
    LaneSelect: ({ viewId }) =>
      Effect.map(selectLane(context, viewId), (selection) => Interaction.Navigating({ selection })),
    TaskSelect: ({ target }) =>
      Effect.succeed(Interaction.Navigating({ selection: Selection.Task({ target }) })),
    TaskCreated: ({ target }) =>
      Effect.succeed(Interaction.Adding({ selection: Selection.Task({ target }) })),
    EditStart: ({ target }) => Effect.succeed(Interaction.Editing({ target })),
    EditCancel: exit,
    EditSave: exit,
    DetailsOpen: openDetails,
    DetailsTabSelect: ({ tab }) =>
      Effect.succeed(
        previous._tag === "Details"
          ? Interaction.Details({ target: previous.target, tab })
          : previous,
      ),
    DetailsClose: exit,
    AddStart: ({ viewId }) => startAdding(context, viewId),
    AddCancel: exit,
    DragStart: ({ source }) => startDrag(context, source),
    DragFinish: ({ viewId }) =>
      previous._tag === "Dragging"
        ? finishDrag(context.graph, previous, viewId)
        : Effect.succeed(previous),
    DragCancel: exit,
  });
  return interaction === previous ? context : { graph: context.graph, interaction };
});
