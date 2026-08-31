import type {
  BoardContext,
  BoardCursor,
  BoardLane,
  HorizontalDirection,
  Task,
  VerticalDirection,
} from "~/board/types";
import { emptySystemBoardLanes, todayLaneId } from "~/board/views";

type TaskLocation = {
  laneIndex: number;
  taskIndex: number;
  lane: BoardLane;
  task: Task;
};

export function initialBoardContext(): BoardContext {
  return {
    lanes: emptySystemBoardLanes(),
    cursor: { laneId: todayLaneId, taskId: null },
  };
}

function findTask(
  lanes: ReadonlyArray<BoardLane>,
  taskId: string,
  preferredLaneId?: string,
): TaskLocation | undefined {
  if (preferredLaneId !== undefined) {
    const laneIndex = lanes.findIndex((lane) => lane.id === preferredLaneId);
    const lane = lanes[laneIndex];
    if (lane !== undefined) {
      const taskIndex = lane.tasks.findIndex((task) => task.id === taskId);
      const task = lane.tasks[taskIndex];
      if (task !== undefined) {
        return { laneIndex, taskIndex, lane, task };
      }
    }
  }

  for (const [laneIndex, lane] of lanes.entries()) {
    const taskIndex = lane.tasks.findIndex((task) => task.id === taskId);
    const task = lane.tasks[taskIndex];
    if (task !== undefined) {
      return { laneIndex, taskIndex, lane, task };
    }
  }

  return undefined;
}

function selectedTask(context: BoardContext): TaskLocation | undefined {
  return context.cursor.taskId === null
    ? undefined
    : findTask(context.lanes, context.cursor.taskId, context.cursor.laneId);
}

function cursorOnLane(lane: BoardLane): BoardCursor {
  return { laneId: lane.id, taskId: lane.tasks[0]?.id ?? null };
}

function fallbackCursor(lanes: ReadonlyArray<BoardLane>): BoardCursor {
  const lane = lanes[0];
  return lane === undefined ? { laneId: todayLaneId, taskId: null } : cursorOnLane(lane);
}

function nearestRemainingLane(
  previous: ReadonlyArray<BoardLane>,
  next: ReadonlyArray<BoardLane>,
  removedId: string,
): BoardLane | undefined {
  const oldIndex = previous.findIndex((lane) => lane.id === removedId);
  const right = oldIndex >= 0 ? previous[oldIndex + 1] : undefined;
  const left = oldIndex >= 0 ? previous[oldIndex - 1] : undefined;

  return (
    (right === undefined ? undefined : next.find((lane) => lane.id === right.id)) ??
    (left === undefined ? undefined : next.find((lane) => lane.id === left.id)) ??
    next[0]
  );
}

export function syncBoard(context: BoardContext, lanes: ReadonlyArray<BoardLane>): BoardContext {
  const nextLanes = [...lanes];
  const currentLane = lanes.find((lane) => lane.id === context.cursor.laneId);

  if (currentLane === undefined) {
    const nearest = nearestRemainingLane(context.lanes, lanes, context.cursor.laneId);
    return {
      ...context,
      lanes: nextLanes,
      cursor: nearest === undefined ? fallbackCursor(lanes) : cursorOnLane(nearest),
    };
  }

  if (context.cursor.taskId !== null) {
    const location = findTask(lanes, context.cursor.taskId, currentLane.id);
    if (location !== undefined) {
      return {
        ...context,
        lanes: nextLanes,
        cursor: { laneId: location.lane.id, taskId: location.task.id },
      };
    }
  }

  return { ...context, lanes: nextLanes, cursor: cursorOnLane(currentLane) };
}

export function isLastTaskInLane(context: BoardContext): boolean {
  const location = selectedTask(context);
  return location !== undefined && location.taskIndex === location.lane.tasks.length - 1;
}

export function isEmptySelectedLane(context: BoardContext): boolean {
  const lane = context.lanes.find((candidate) => candidate.id === context.cursor.laneId);
  return lane !== undefined && lane.tasks.length === 0;
}

function focus(context: BoardContext, taskId: string | null): BoardContext {
  if (taskId === null) {
    return { ...context, cursor: fallbackCursor(context.lanes) };
  }

  const location = findTask(context.lanes, taskId);
  return location === undefined
    ? { ...context, cursor: fallbackCursor(context.lanes) }
    : { ...context, cursor: { laneId: location.lane.id, taskId: location.task.id } };
}

export function selectTask(context: BoardContext, taskId: string, laneId?: string): BoardContext {
  const location = findTask(context.lanes, taskId, laneId ?? context.cursor.laneId);
  const resolvedLaneId =
    laneId !== undefined && context.lanes.some((lane) => lane.id === laneId)
      ? laneId
      : (location?.lane.id ?? context.cursor.laneId);

  return { ...context, cursor: { laneId: resolvedLaneId, taskId } };
}

export function currentLaneId(context: BoardContext): string {
  return context.cursor.laneId;
}

export function selectLaneById(context: BoardContext, laneId: string): BoardContext {
  const lane = context.lanes.find((candidate) => candidate.id === laneId);
  if (lane === undefined) {
    return { ...context, cursor: { laneId, taskId: null } };
  }

  if (selectedTask(context)?.lane.id === laneId) {
    return { ...context, cursor: { laneId, taskId: context.cursor.taskId } };
  }

  return { ...context, cursor: cursorOnLane(lane) };
}

export function startAdding(context: BoardContext, laneId: string): BoardContext {
  const taskId =
    context.cursor.laneId === laneId &&
    context.cursor.taskId !== null &&
    findTask(context.lanes, context.cursor.taskId, laneId) !== undefined
      ? context.cursor.taskId
      : null;

  return { ...context, cursor: { laneId, taskId } };
}

export function leaveAdding(context: BoardContext): BoardContext {
  const lane = context.lanes.find((candidate) => candidate.id === context.cursor.laneId);
  const lastTask = lane === undefined ? undefined : lastTaskInLane(lane);
  return lastTask === undefined || lane === undefined
    ? { ...context, cursor: { laneId: context.cursor.laneId, taskId: null } }
    : selectTask(context, lastTask.id, lane.id);
}

function lastTaskInLane(lane: BoardLane): Task | undefined {
  return lane.tasks[lane.tasks.length - 1];
}

export function selectVertical(context: BoardContext, direction: VerticalDirection): BoardContext {
  const location = selectedTask(context);
  if (location === undefined) {
    const lane = context.lanes.find((candidate) => candidate.id === context.cursor.laneId);
    if (lane === undefined) {
      return focus(context, fallbackCursor(context.lanes).taskId);
    }

    if (direction === "down") {
      const firstTask = lane.tasks[0];
      return firstTask === undefined
        ? startAdding(context, lane.id)
        : selectTask(context, firstTask.id, lane.id);
    }

    return context;
  }

  if (direction === "down") {
    const nextTask = location.lane.tasks[location.taskIndex + 1];
    return nextTask === undefined
      ? startAdding(context, location.lane.id)
      : selectTask(context, nextTask.id, location.lane.id);
  }

  const previousTask = location.lane.tasks[location.taskIndex - 1];
  return previousTask === undefined
    ? context
    : selectTask(context, previousTask.id, location.lane.id);
}

export function selectHorizontal(
  context: BoardContext,
  direction: HorizontalDirection,
): BoardContext {
  const location = selectedTask(context);
  const laneIndex =
    location?.laneIndex ??
    context.lanes.findIndex((candidate) => candidate.id === context.cursor.laneId);
  if (laneIndex < 0) {
    return focus(context, fallbackCursor(context.lanes).taskId);
  }

  const nextLane = context.lanes[direction === "left" ? laneIndex - 1 : laneIndex + 1];
  if (nextLane === undefined) {
    return context;
  }

  const nextTask = nextLane.tasks[0];
  return nextTask === undefined
    ? selectLaneById(context, nextLane.id)
    : selectTask(context, nextTask.id, nextLane.id);
}
