import type {
  BoardContext,
  HorizontalDirection,
  Lane,
  LaneKind,
  Task,
  TaskDepth,
  VerticalDirection,
} from "~/board/types";

type TaskLocation = {
  laneIndex: number;
  taskIndex: number;
  lane: Lane;
  task: Task;
};

function findTask(lanes: Lane[], taskId: string): TaskLocation | undefined {
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
  return context.selectedId === null ? undefined : findTask(context.lanes, context.selectedId);
}

function adjacentIndex(index: number, direction: HorizontalDirection | VerticalDirection): number {
  return direction === "left" || direction === "up" ? index - 1 : index + 1;
}

function setTaskDepth(
  context: BoardContext,
  location: TaskLocation,
  depth: TaskDepth | undefined,
): BoardContext {
  return {
    ...context,
    lanes: context.lanes.map((lane, laneIndex) =>
      laneIndex !== location.laneIndex
        ? lane
        : {
            ...lane,
            tasks: lane.tasks.map((task) =>
              task.id === location.task.id ? { ...task, depth } : task,
            ),
          },
    ),
  };
}

export function createBoard(lanes: Lane[], selectedId?: string): BoardContext {
  const resolvedSelectedId = selectedId ?? firstTaskId(lanes);
  return {
    lanes,
    selectedId: resolvedSelectedId,
    selectedLaneId: laneIdForTask(lanes, resolvedSelectedId) ?? firstLaneId(lanes),
    addingLaneId: null,
  };
}

function firstLaneId(lanes: Lane[]): string | null {
  return lanes[0]?.id ?? null;
}

function laneIdForTask(lanes: Lane[], taskId: string | null): string | null {
  return taskId === null ? null : (findTask(lanes, taskId)?.lane.id ?? null);
}

function firstTaskId(lanes: Lane[]): string | null {
  for (const lane of lanes) {
    const task = lane.tasks[0];
    if (task !== undefined) {
      return task.id;
    }
  }

  return null;
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

export function selectTask(context: BoardContext, taskId: string): BoardContext {
  return focus(context, taskId);
}

export function currentLaneId(context: BoardContext): string | null {
  return context.addingLaneId ?? context.selectedLaneId;
}

export function selectLaneById(context: BoardContext, laneId: string): BoardContext {
  const lane = context.lanes.find((candidate) => candidate.id === laneId);
  if (lane === undefined) {
    return context;
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

export function selectVertical(context: BoardContext, direction: VerticalDirection): BoardContext {
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
        : selectTask(context, firstTask.id);
    }

    return context;
  }

  if (direction === "down") {
    const nextTask = location.lane.tasks[location.taskIndex + 1];
    return nextTask === undefined
      ? startAdding(context, location.lane.id)
      : selectTask(context, nextTask.id);
  }

  const previousTask = location.lane.tasks[location.taskIndex - 1];
  return previousTask === undefined ? context : selectTask(context, previousTask.id);
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

  const nextLane = context.lanes[adjacentIndex(laneIndex, direction)];
  if (nextLane === undefined) {
    return context;
  }

  const nextTask = nextLane.tasks[0];
  return nextTask === undefined
    ? selectLaneById(context, nextLane.id)
    : selectTask(context, nextTask.id);
}

export function selectLane(context: BoardContext, kind: LaneKind): BoardContext {
  const lane = context.lanes.find((candidate) => candidate.kind === kind);
  return lane === undefined ? context : selectLaneById(context, lane.id);
}

export function logComplete(context: BoardContext, taskId: string): void {
  const location = findTask(context.lanes, taskId);
  if (location !== undefined) {
    console.log(`Complete ${location.task.title}`);
  }
}

export function setDepth(context: BoardContext, delta: 1 | -1): BoardContext {
  const location = selectedTask(context);
  if (location === undefined || (delta === 1 && location.taskIndex === 0)) {
    return context;
  }

  const depth = (location.task.depth ?? 0) + delta;
  if (depth < 0 || depth > 2) {
    return context;
  }

  return setTaskDepth(context, location, depth === 1 || depth === 2 ? depth : undefined);
}

export function moveInLane(context: BoardContext, direction: VerticalDirection): BoardContext {
  const location = selectedTask(context);
  if (location === undefined) {
    return context;
  }

  const targetIndex = adjacentIndex(location.taskIndex, direction);
  if (targetIndex < 0 || targetIndex >= location.lane.tasks.length) {
    return context;
  }

  const tasks = location.lane.tasks.slice();
  const [moved] = tasks.splice(location.taskIndex, 1);
  if (moved === undefined) {
    return context;
  }

  const { depth: _depth, ...rootTask } = moved;
  tasks.splice(targetIndex, 0, targetIndex === 0 ? rootTask : moved);

  return {
    ...context,
    lanes: context.lanes.map((lane, laneIndex) =>
      laneIndex === location.laneIndex ? { ...lane, tasks } : lane,
    ),
  };
}

export function moveToLane(context: BoardContext, direction: HorizontalDirection): BoardContext {
  const location = selectedTask(context);
  if (location === undefined) {
    return context;
  }

  const destinationIndex = adjacentIndex(location.laneIndex, direction);
  if (context.lanes[destinationIndex] === undefined) {
    return context;
  }

  const { depth: _depth, ...rootTask } = location.task;

  return {
    ...context,
    selectedLaneId: context.lanes[destinationIndex]?.id ?? context.selectedLaneId,
    lanes: context.lanes.map((lane, laneIndex) => {
      if (laneIndex === location.laneIndex) {
        return {
          ...lane,
          tasks: lane.tasks.filter((task) => task.id !== location.task.id),
        };
      }

      if (laneIndex === destinationIndex) {
        return { ...lane, tasks: [...lane.tasks, rootTask] };
      }

      return lane;
    }),
  };
}

export function addTask(
  context: BoardContext,
  title: string,
  id: string,
  date?: string,
): BoardContext {
  const laneId = context.addingLaneId;
  const trimmedTitle = title.trim();
  if (laneId === null || trimmedTitle === "") {
    return context;
  }

  const task: Task =
    date === undefined || date === ""
      ? { id, title: trimmedTitle }
      : { id, title: trimmedTitle, date };

  return {
    ...context,
    selectedId: id,
    lanes: context.lanes.map((lane) =>
      lane.id === laneId ? { ...lane, tasks: [...lane.tasks, task] } : lane,
    ),
  };
}
