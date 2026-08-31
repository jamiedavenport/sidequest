import type {
  BoardContext,
  BoardLane,
  HorizontalDirection,
  Task,
  VerticalDirection,
} from "~/board/types";

type TaskLocation = {
  laneIndex: number;
  taskIndex: number;
  lane: BoardLane;
  task: Task;
};

function findTask(
  lanes: ReadonlyArray<BoardLane>,
  taskId: string,
  preferredLaneId?: string | null,
): TaskLocation | undefined {
  if (preferredLaneId !== undefined && preferredLaneId !== null) {
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
  return context.selectedId === null
    ? undefined
    : findTask(context.lanes, context.selectedId, context.selectedLaneId);
}

function firstLaneId(lanes: ReadonlyArray<BoardLane>): string | null {
  return lanes[0]?.id ?? null;
}

function laneIdForTask(lanes: ReadonlyArray<BoardLane>, taskId: string | null): string | null {
  return taskId === null ? null : (findTask(lanes, taskId)?.lane.id ?? null);
}

function firstTaskId(lanes: ReadonlyArray<BoardLane>): string | null {
  for (const lane of lanes) {
    const task = lane.tasks[0];
    if (task !== undefined) {
      return task.id;
    }
  }

  return null;
}

function nearestRemainingLane(
  previous: ReadonlyArray<BoardLane>,
  next: ReadonlyArray<BoardLane>,
  removedId: string | null,
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
  const selectedLaneGone =
    context.selectedLaneId !== null && !lanes.some((lane) => lane.id === context.selectedLaneId);

  if (selectedLaneGone) {
    const nearest = nearestRemainingLane(context.lanes, lanes, context.selectedLaneId);
    return {
      ...context,
      lanes: [...lanes],
      selectedId: nearest?.tasks[0]?.id ?? null,
      selectedLaneId: nearest?.id ?? firstLaneId(lanes),
      addingLaneId:
        context.addingLaneId !== null && lanes.some((lane) => lane.id === context.addingLaneId)
          ? context.addingLaneId
          : null,
    };
  }

  const selectedId =
    context.selectedId !== null && findTask(lanes, context.selectedId) !== undefined
      ? context.selectedId
      : firstTaskId(lanes);

  return {
    ...context,
    lanes: [...lanes],
    selectedId,
    selectedLaneId:
      context.selectedLaneId !== null && lanes.some((lane) => lane.id === context.selectedLaneId)
        ? context.selectedLaneId
        : (laneIdForTask(lanes, selectedId) ?? firstLaneId(lanes)),
    addingLaneId:
      context.addingLaneId !== null && lanes.some((lane) => lane.id === context.addingLaneId)
        ? context.addingLaneId
        : null,
  };
}

export function isLastTaskInLane(context: BoardContext): boolean {
  const location = selectedTask(context);
  return location !== undefined && location.taskIndex === location.lane.tasks.length - 1;
}

export function isEmptySelectedLane(context: BoardContext): boolean {
  const lane = context.lanes.find((candidate) => candidate.id === context.selectedLaneId);
  return lane !== undefined && lane.tasks.length === 0;
}

function focus(context: BoardContext, selectedId: string | null): BoardContext {
  return {
    ...context,
    selectedId,
    selectedLaneId: laneIdForTask(context.lanes, selectedId) ?? context.selectedLaneId,
    addingLaneId: null,
  };
}

export function selectTask(context: BoardContext, taskId: string, laneId?: string): BoardContext {
  const location = findTask(context.lanes, taskId, laneId ?? context.selectedLaneId);
  const selectedLaneId =
    laneId !== undefined && context.lanes.some((lane) => lane.id === laneId)
      ? laneId
      : (location?.lane.id ?? context.selectedLaneId);

  return {
    ...context,
    selectedId: taskId,
    selectedLaneId,
    addingLaneId: null,
  };
}

export function currentLaneId(context: BoardContext): string | null {
  return context.addingLaneId ?? context.selectedLaneId;
}

export function selectLaneById(context: BoardContext, laneId: string): BoardContext {
  const lane = context.lanes.find((candidate) => candidate.id === laneId);
  if (lane === undefined) {
    return {
      ...context,
      selectedId: null,
      selectedLaneId: laneId,
      addingLaneId: null,
    };
  }

  if (selectedTask(context)?.lane.id === laneId) {
    return { ...context, selectedLaneId: laneId, addingLaneId: null };
  }

  return {
    ...context,
    selectedId: lane.tasks[0]?.id ?? null,
    selectedLaneId: laneId,
    addingLaneId: null,
  };
}

export function startAdding(context: BoardContext, laneId: string): BoardContext {
  return { ...context, addingLaneId: laneId, selectedLaneId: laneId };
}

export function cancelAdd(context: BoardContext): BoardContext {
  return { ...context, addingLaneId: null };
}

function lastTaskInLane(lane: BoardLane): Task | undefined {
  return lane.tasks[lane.tasks.length - 1];
}

export function selectVertical(context: BoardContext, direction: VerticalDirection): BoardContext {
  if (context.addingLaneId !== null && direction === "up") {
    const lane = context.lanes.find((candidate) => candidate.id === context.addingLaneId);
    const lastTask = lane === undefined ? undefined : lastTaskInLane(lane);
    return lastTask === undefined || lane === undefined
      ? cancelAdd(context)
      : selectTask(context, lastTask.id, lane.id);
  }

  const location = selectedTask(context);
  if (location === undefined) {
    const lane = context.lanes.find((candidate) => candidate.id === context.selectedLaneId);
    if (lane === undefined) {
      return focus(context, firstTaskId(context.lanes));
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
    context.lanes.findIndex((candidate) => candidate.id === context.selectedLaneId);
  if (laneIndex < 0) {
    return focus(context, firstTaskId(context.lanes));
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
