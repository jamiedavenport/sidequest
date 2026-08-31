import { formatTaskDate, isTaskDateToday } from "~/board/date";
import type { BoardTask, Lane, Task } from "~/board/schema";

export const inboxLaneId = "inbox";
export const todayLaneId = "today";

export const systemLanes: ReadonlyArray<Lane> = [
  {
    id: todayLaneId,
    title: "Today",
    caption: "One thing at a time.",
    colour: "amber",
    shape: "circle",
    rank: 0,
  },
  {
    id: inboxLaneId,
    title: "Inbox",
    caption: "Capture now. Decide later.",
    colour: "green",
    shape: "square",
    rank: 1,
  },
];

export type TaskPlacement = {
  laneId?: string;
  date?: string;
};

function isSystemLaneId(id: string): boolean {
  return id === inboxLaneId || id === todayLaneId;
}

export function isSystemLane(lane: Pick<Lane, "id">): boolean {
  return isSystemLaneId(lane.id);
}

function isPersistedLane(lane: Lane): boolean {
  return !isSystemLane(lane);
}

function projectLaneId(task: Task): string | undefined {
  return task.laneId !== undefined && !isSystemLaneId(task.laneId) ? task.laneId : undefined;
}

function isTodayTask(task: Task, now = new Date()): boolean {
  return task.laneId === todayLaneId || isTaskDateToday(task.date, now);
}

function isInboxTask(task: Task, now = new Date()): boolean {
  return projectLaneId(task) === undefined && !isTodayTask(task, now);
}

export function isTaskInView(task: Task, viewId: string, now = new Date()): boolean {
  if (viewId === inboxLaneId) {
    return isInboxTask(task, now);
  }

  if (viewId === todayLaneId) {
    return isTodayTask(task, now);
  }

  return projectLaneId(task) === viewId;
}

export function currentViewId(task: Task, now = new Date()): string {
  const assigned = projectLaneId(task);
  if (assigned !== undefined) {
    return assigned;
  }

  return isTodayTask(task, now) ? todayLaneId : inboxLaneId;
}

export function placementForCreate(viewId: string, date?: string, now = new Date()): TaskPlacement {
  if (viewId === inboxLaneId) {
    if (date !== undefined && date !== "" && !isTaskDateToday(date, now)) {
      return { date };
    }

    return {};
  }

  if (viewId === todayLaneId) {
    return { date: formatTaskDate(now, now) };
  }

  return {
    laneId: viewId,
    ...(date === undefined || date === "" ? {} : { date }),
  };
}

export function placementForMove(
  viewId: string,
  current: Pick<Task, "date">,
  now = new Date(),
): TaskPlacement {
  if (viewId === inboxLaneId) {
    return {};
  }

  if (viewId === todayLaneId) {
    return { date: formatTaskDate(now, now) };
  }

  return {
    laneId: viewId,
    ...(current.date === undefined ? {} : { date: current.date }),
  };
}

export function applyPlacement(
  draft: { laneId?: string; date?: string },
  placement: TaskPlacement,
): void {
  if (placement.laneId === undefined) {
    delete draft.laneId;
  } else {
    draft.laneId = placement.laneId;
  }

  if (placement.date === undefined) {
    delete draft.date;
  } else {
    draft.date = placement.date;
  }
}

export function normalizeTask(task: Task, now = new Date()): Task {
  if (task.laneId === inboxLaneId) {
    const { laneId: _laneId, ...rest } = task;
    return rest;
  }

  if (task.laneId === todayLaneId) {
    const { laneId: _laneId, ...rest } = task;
    return {
      ...rest,
      date: task.date ?? formatTaskDate(now, now),
    };
  }

  return task;
}

export function boardViewIds(persisted: ReadonlyArray<Lane>): string[] {
  return [
    ...systemLanes.map((lane) => lane.id),
    ...persisted
      .filter(isPersistedLane)
      .toSorted((left, right) => left.rank - right.rank)
      .map((lane) => lane.id),
  ];
}

function visualTaskDepth(
  task: Task,
  viewIds: ReadonlySet<string>,
  parents: ReadonlyMap<string, string | undefined>,
): number {
  let depth = 0;
  let current = parents.get(task.id);
  const seen = new Set<string>([task.id]);
  while (current !== undefined && viewIds.has(current) && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = parents.get(current);
  }

  return depth;
}

function ancestorAtVisualDepth(
  tasks: ReadonlyArray<Task>,
  index: number,
  depth: number,
  viewIds: ReadonlySet<string>,
  parents: ReadonlyMap<string, string | undefined>,
): Task | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = tasks[cursor];
    if (candidate !== undefined && visualTaskDepth(candidate, viewIds, parents) === depth) {
      return candidate;
    }
  }

  return undefined;
}

type NestUpdate = {
  parentId?: string;
};

export function planNest(
  tasks: ReadonlyArray<Task>,
  taskId: string,
  delta: 1 | -1,
  allTasks: ReadonlyArray<Task> = tasks,
): NestUpdate | undefined {
  const index = tasks.findIndex((candidate) => candidate.id === taskId);
  if (index < 0 || (delta === 1 && index === 0)) {
    return undefined;
  }

  const parents = resolveTaskParents(allTasks);
  const viewIds = new Set(tasks.map((task) => task.id));
  const task = tasks[index];
  if (task === undefined) {
    return undefined;
  }

  const depth = visualTaskDepth(task, viewIds, parents);
  if (delta === -1) {
    const parentId = parents.get(task.id);
    if (depth === 0 || parentId === undefined) {
      return undefined;
    }

    if (depth === 1) {
      return {};
    }

    const grandparentId = parents.get(parentId);
    return grandparentId === undefined ? {} : { parentId: grandparentId };
  }

  const parent = ancestorAtVisualDepth(tasks, index, depth, viewIds, parents);
  if (parent === undefined) {
    return undefined;
  }

  return { parentId: parent.id };
}

function uniqueTasks(tasks: ReadonlyArray<Task>): Task[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) {
      return false;
    }

    seen.add(task.id);
    return true;
  });
}

function resolveTaskParents(tasks: ReadonlyArray<Task>): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>();
  for (const task of uniqueTasks(tasks)) {
    parents.set(task.id, task.parentId);
  }

  return parents;
}

export function projectTasksForView(
  viewTasks: ReadonlyArray<Task>,
  allTasks: ReadonlyArray<Task> = viewTasks,
): BoardTask[] {
  const parents = resolveTaskParents(allTasks);
  const ids = new Set(viewTasks.map((task) => task.id));

  return viewTasks
    .toSorted((left, right) => left.rank - right.rank)
    .map((task) => ({
      ...task,
      visualDepth: visualTaskDepth(task, ids, parents),
    }));
}

type WritableTaskDraft = {
  laneId?: string;
  date?: string;
  parentId?: string;
};

export function migrateLegacySystemLanes(input: {
  lanes: {
    toArray: ReadonlyArray<Lane>;
    has: (id: string) => boolean;
    delete: (id: string) => void;
  };
  tasks: {
    toArray: ReadonlyArray<Task>;
    update: (id: string, updater: (draft: WritableTaskDraft) => void) => void;
  };
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  let changed = false;

  for (const task of input.tasks.toArray) {
    if (task.laneId === inboxLaneId) {
      input.tasks.update(task.id, (draft) => {
        delete draft.laneId;
      });
      changed = true;
      continue;
    }

    if (task.laneId === todayLaneId) {
      input.tasks.update(task.id, (draft) => {
        delete draft.laneId;
        draft.date = draft.date ?? formatTaskDate(now, now);
      });
      changed = true;
    }
  }

  for (const lane of input.lanes.toArray) {
    if (isSystemLane(lane) && input.lanes.has(lane.id)) {
      input.lanes.delete(lane.id);
      changed = true;
    }
  }

  return changed;
}

type TaskCompletionStore = {
  toArray: ReadonlyArray<Task>;
  has: (id: string) => boolean;
  get: (id: string) => Task | undefined;
  update: (id: string, updater: (draft: { completed: boolean }) => void) => void;
};

function descendantTaskIds(tasks: ReadonlyArray<Task>, rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const [id, parentId] of resolveTaskParents(tasks)) {
    if (parentId === undefined) {
      continue;
    }

    const siblings = children.get(parentId) ?? [];
    siblings.push(id);
    children.set(parentId, siblings);
  }

  const descendants: string[] = [];
  const seen = new Set<string>([rootId]);
  const queue = [...(children.get(rootId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || seen.has(id)) {
      continue;
    }

    seen.add(id);
    descendants.push(id);
    const nested = children.get(id);
    if (nested !== undefined) {
      queue.push(...nested);
    }
  }

  return descendants;
}

export function completeTaskAndDescendants(tasks: TaskCompletionStore, taskId: string): Task[] {
  if (!tasks.has(taskId)) {
    return [];
  }

  const completed: Task[] = [];
  for (const id of [taskId, ...descendantTaskIds(tasks.toArray, taskId)]) {
    const current = tasks.get(id);
    if (current === undefined || current.completed) {
      continue;
    }

    tasks.update(id, (draft) => {
      draft.completed = true;
    });
    const next = tasks.get(id);
    if (next !== undefined) {
      completed.push(next);
    }
  }

  return completed;
}

export function enforcedDescendantCompletions(
  tasks: TaskCompletionStore,
  completedIds: ReadonlyArray<string>,
): Task[] {
  const extras: Task[] = [];
  const seen = new Set<string>();
  for (const id of completedIds) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    extras.push(...completeTaskAndDescendants(tasks, id));
  }

  return extras;
}
