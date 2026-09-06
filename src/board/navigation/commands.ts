import { Effect, Option } from "effect";
import { emptySystemBoardLanes, isSystemLane, todayLaneId } from "~/board/views";
import { buildBoardGraph, type BoardGraph, type LaneNode } from "./graph";
import {
  Interaction,
  Selection,
  currentLaneId,
  selectionOf,
  viewIdOf,
  type BoardContext,
  type BoardEvent,
  type DragSource,
} from "./model";

export function initialBoardContext(): BoardContext {
  return {
    graph: buildBoardGraph(emptySystemBoardLanes(), []),
    interaction: Interaction.Navigating({ selection: Selection.Lane({ viewId: todayLaneId }) }),
  };
}

function onLane(lane: LaneNode | undefined): Selection {
  return lane?.firstVisible
    ? Selection.Task({ target: lane.firstVisible.target })
    : Selection.Lane({ viewId: lane?.id ?? todayLaneId });
}

function reconcile(context: BoardContext, graph: BoardGraph): Selection {
  const selected = selectionOf(context.interaction);
  const viewId = viewIdOf(selected);
  const lane = Option.getOrUndefined(graph.lane(viewId));
  if (!lane) {
    const previousLane = Option.getOrUndefined(context.graph.lane(viewId));
    const right = previousLane?.next;
    const left = previousLane?.previous;
    return onLane(
      (right && Option.getOrUndefined(graph.lane(right.id))) ??
        (left && Option.getOrUndefined(graph.lane(left.id))) ??
        graph.firstLane,
    );
  }
  if (selected._tag === "Task") {
    const current =
      Option.getOrUndefined(graph.visibleTask(selected.target)) ??
      Option.getOrUndefined(graph.firstVisibleOccurrence(selected.target.taskId));
    if (current) return Selection.Task({ target: current.target });
    let ancestor = Option.getOrUndefined(context.graph.task(selected.target))?.parent;
    while (ancestor) {
      if (Option.isSome(graph.visibleTask(ancestor.target)))
        return Selection.Task({ target: ancestor.target });
      ancestor = ancestor.parent;
    }
  }
  return onLane(lane);
}

function sourceExists(graph: BoardGraph, source: DragSource): boolean {
  return source._tag === "Task"
    ? Option.isSome(graph.visibleTask(source.target))
    : Option.isSome(graph.lane(source.viewId));
}

export const syncBoard = Effect.fn("syncBoard")(
  (
    context: BoardContext,
    event: Extract<BoardEvent, { _tag: "BoardSync" }>,
  ): Effect.Effect<BoardContext> =>
    Effect.sync(() => {
      const graph = buildBoardGraph(event.lanes, event.tasks);
      const selection = reconcile(context, graph);
      const previous = context.interaction;
      const interaction = Interaction.match<Interaction>(previous, {
        Navigating: () => Interaction.Navigating({ selection }),
        Adding: () =>
          Option.isSome(graph.lane(currentLaneId(context)))
            ? Interaction.Adding({ selection })
            : Interaction.Navigating({ selection }),
        Editing: (editing) =>
          Option.isSome(graph.visibleTask(editing.target))
            ? editing
            : Interaction.Navigating({ selection }),
        Details: (details) =>
          Option.isSome(graph.visibleTask(details.target))
            ? details
            : Interaction.Navigating({ selection }),
        Dragging: (dragging) =>
          sourceExists(graph, dragging.source)
            ? Interaction.Dragging({ selection, source: dragging.source })
            : Interaction.Navigating({ selection }),
      });
      return { graph, interaction };
    }),
);

export const selectLane = Effect.fn("selectLane")(
  (context: BoardContext, viewId: string): Effect.Effect<Selection> =>
    Effect.sync(() => {
      const selection = selectionOf(context.interaction);
      if (
        selection._tag === "Task" &&
        selection.target.viewId === viewId &&
        Option.isSome(context.graph.visibleTask(selection.target))
      )
        return selection;
      const lane = Option.getOrUndefined(context.graph.lane(viewId));
      return lane ? onLane(lane) : Selection.Lane({ viewId });
    }),
);

export const startAdding = Effect.fn("startAdding")(
  (context: BoardContext, viewId: string): Effect.Effect<Interaction> =>
    Effect.sync(() => {
      const selected = selectionOf(context.interaction);
      const selection =
        selected._tag === "Task" &&
        selected.target.viewId === viewId &&
        Option.isSome(context.graph.visibleTask(selected.target))
          ? selected
          : Selection.Lane({ viewId });
      return Interaction.Adding({ selection });
    }),
);

export const leaveAdding = Effect.fn("leaveAdding")(
  (context: BoardContext): Effect.Effect<Interaction> =>
    Effect.sync(() => {
      const viewId = currentLaneId(context);
      const last = Option.getOrUndefined(context.graph.lane(viewId))?.lastVisible;
      return Interaction.Navigating({
        selection: last ? Selection.Task({ target: last.target }) : Selection.Lane({ viewId }),
      });
    }),
);

export const navigate = Effect.fn("navigate")(
  (
    context: BoardContext,
    direction: Extract<BoardEvent, { _tag: "Navigate" }>["direction"],
  ): Effect.Effect<Interaction> =>
    Effect.sync(() => {
      const selection = selectionOf(context.interaction);
      const lane = Option.getOrUndefined(context.graph.lane(viewIdOf(selection)));
      if (!lane) return Interaction.Navigating({ selection: onLane(context.graph.firstLane) });
      if (direction === "left" || direction === "right") {
        const destination = direction === "left" ? lane.previous : lane.next;
        return destination
          ? Interaction.Navigating({ selection: onLane(destination) })
          : context.interaction;
      }
      const node =
        selection._tag === "Task"
          ? Option.getOrUndefined(context.graph.visibleTask(selection.target))
          : undefined;
      if (direction === "down") {
        const next = node ? node.nextVisible : lane.firstVisible;
        return next
          ? Interaction.Navigating({ selection: Selection.Task({ target: next.target }) })
          : Interaction.Adding({
              selection: node ? selection : Selection.Lane({ viewId: lane.id }),
            });
      }
      return node?.previousVisible
        ? Interaction.Navigating({
            selection: Selection.Task({ target: node.previousVisible.target }),
          })
        : context.interaction;
    }),
);

export const openDetails = Effect.fn("openDetails")(
  (event: Extract<BoardEvent, { _tag: "DetailsOpen" }>) =>
    Effect.sync(() => {
      return Interaction.Details({ target: event.target, tab: event.tab });
    }),
);

export const startDrag = Effect.fn("startDrag")(function* (
  context: BoardContext,
  source: DragSource,
): Effect.fn.Return<Interaction> {
  if (
    !sourceExists(context.graph, source) ||
    (source._tag === "Lane" && isSystemLane({ id: source.viewId }))
  )
    return context.interaction;
  const selection =
    source._tag === "Task"
      ? Selection.Task({ target: source.target })
      : yield* selectLane(context, source.viewId);
  return Interaction.Dragging({ selection, source });
});

export const finishDrag = Effect.fn("finishDrag")(function* (
  graph: BoardGraph,
  dragging: Extract<Interaction, { _tag: "Dragging" }>,
  viewId: string,
) {
  const selection =
    dragging.source._tag === "Task"
      ? Selection.Task({ target: { taskId: dragging.source.target.taskId, viewId } })
      : yield* selectLane({ graph, interaction: dragging }, viewId);
  return Interaction.Navigating({ selection });
});
