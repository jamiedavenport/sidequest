import { formatTaskDate, isTaskDateToday } from "~/board/date";
import type {
  BoardLane,
  BoardTask,
  Lane,
  LaneSymbolColour,
  LaneSymbolShape,
  Task,
} from "~/board/schema";
import type { HorizontalDirection, VerticalDirection } from "~/board/types";

export const inboxLaneId = "inbox";
export const todayLaneId = "today";

export const systemLanes: ReadonlyArray<Lane> = [
  {
    id: todayLaneId,
    title: "Today",
    colour: "amber",
    shape: "circle",
    rank: 0,
  },
  {
    id: inboxLaneId,
    title: "Inbox",
    colour: "green",
    shape: "square",
    rank: 1,
  },
];

export function emptySystemBoardLanes(): BoardLane[] {
  return systemLanes.map((lane) => ({ ...lane, tasks: [] }));
}

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

const laneColours = [
  "green",
  "amber",
  "blue",
  "violet",
] as const satisfies ReadonlyArray<LaneSymbolColour>;

const laneShapes = [
  "square",
  "circle",
  "diamond",
] as const satisfies ReadonlyArray<LaneSymbolShape>;

function pickOne<T>(values: ReadonlyArray<T>): T {
  const value = values[Math.floor(Math.random() * values.length)];
  if (value === undefined) {
    throw new Error("Cannot pick from an empty list");
  }

  return value;
}

export function randomLaneSymbol(): {
  colour: LaneSymbolColour;
  shape: LaneSymbolShape;
} {
  return {
    colour: pickOne(laneColours),
    shape: pickOne(laneShapes),
  };
}

export function persistedLanes(lanes: ReadonlyArray<Lane>): Lane[] {
  return lanes.filter(isPersistedLane).toSorted((left, right) => left.rank - right.rank);
}

export type LaneRankSwap = {
  laneId: string;
  rank: number;
};

export function planLaneMove(
  lanes: ReadonlyArray<Lane>,
  laneId: string,
  direction: HorizontalDirection,
): ReadonlyArray<LaneRankSwap> | undefined {
  const ordered = persistedLanes(lanes);
  const index = ordered.findIndex((lane) => lane.id === laneId);
  const neighbor = ordered[direction === "left" ? index - 1 : index + 1];
  const current = ordered[index];
  if (index < 0 || current === undefined || neighbor === undefined) {
    return undefined;
  }

  return [
    { laneId: current.id, rank: neighbor.rank },
    { laneId: neighbor.id, rank: current.rank },
  ];
}

export function tasksInLane(tasks: ReadonlyArray<Task>, laneId: string): Task[] {
  return tasks.filter((task) => task.laneId === laneId);
}

export function rehomeTasksForDeletedLane(
  tasks: {
    toArray: ReadonlyArray<Task>;
    update: (id: string, updater: (draft: WritableTaskDraft) => void) => void;
  },
  laneId: string,
): void {
  for (const task of tasksInLane(tasks.toArray, laneId)) {
    tasks.update(task.id, (draft) => {
      clearOptional(draft, "laneId");
    });
  }
}

export function deleteTasksForDeletedLane(
  tasks: {
    toArray: ReadonlyArray<Task>;
    delete: (id: string) => void;
  },
  laneId: string,
): void {
  for (const task of tasksInLane(tasks.toArray, laneId)) {
    tasks.delete(task.id);
  }
}

function hasOrphanLaneAssignment(lanes: ReadonlyArray<Lane>, tasks: ReadonlyArray<Task>): boolean {
  const ids = new Set(lanes.map((lane) => lane.id));
  return tasks.some(
    (task) => task.laneId !== undefined && !isSystemLaneId(task.laneId) && !ids.has(task.laneId),
  );
}

function repairOrphanLaneAssignments(input: {
  lanes: { toArray: ReadonlyArray<Lane> };
  tasks: {
    toArray: ReadonlyArray<Task>;
    update: (id: string, updater: (draft: WritableTaskDraft) => void) => void;
  };
}): boolean {
  const ids = new Set(input.lanes.toArray.map((lane) => lane.id));
  let changed = false;
  for (const task of input.tasks.toArray) {
    if (task.laneId === undefined || isSystemLaneId(task.laneId) || ids.has(task.laneId)) {
      continue;
    }

    input.tasks.update(task.id, (draft) => {
      clearOptional(draft, "laneId");
    });
    changed = true;
  }

  return changed;
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

function clearOptional(
  draft: { laneId?: string; date?: string; parentId?: string },
  key: "laneId" | "date" | "parentId",
): void {
  // TanStack DB change tracking ignores `delete`, so the update patch must assign undefined.
  draft[key] = undefined;
}

export function applyPlacement(
  draft: { laneId?: string; date?: string },
  placement: TaskPlacement,
): void {
  if (placement.laneId === undefined) {
    clearOptional(draft, "laneId");
  } else {
    draft.laneId = placement.laneId;
  }

  if (placement.date === undefined) {
    clearOptional(draft, "date");
  } else {
    draft.date = placement.date;
  }
}

function taskPlacement(task: Pick<Task, "laneId" | "date">): TaskPlacement {
  return {
    ...(task.laneId === undefined ? {} : { laneId: task.laneId }),
    ...(task.date === undefined ? {} : { date: task.date }),
  };
}

function placementsMatch(
  left: Pick<Task, "laneId" | "date">,
  right: Pick<Task, "laneId" | "date">,
) {
  return left.laneId === right.laneId && left.date === right.date;
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

export type TaskRankUpdate = {
  taskId: string;
  rank: number;
};

function taskSubtree(tasks: ReadonlyArray<Task>, rootId: string): Task[] {
  const ids = new Set([rootId, ...descendantTaskIds(tasks, rootId)]);
  return uniqueTasks(tasks)
    .filter((task) => ids.has(task.id))
    .toSorted((left, right) => left.rank - right.rank);
}

export function planTaskMove(
  visibleTasks: ReadonlyArray<Task>,
  allTasks: ReadonlyArray<Task>,
  taskId: string,
  direction: VerticalDirection,
): ReadonlyArray<TaskRankUpdate> | undefined {
  const ordered = visibleTasks.toSorted((left, right) => left.rank - right.rank);
  const task = ordered.find((candidate) => candidate.id === taskId);
  if (task === undefined) {
    return undefined;
  }

  const parents = resolveTaskParents(allTasks);
  const parentId = parents.get(taskId);
  const siblings = ordered.filter((candidate) => parents.get(candidate.id) === parentId);
  const index = siblings.findIndex((candidate) => candidate.id === taskId);
  const neighbor = siblings[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || neighbor === undefined) {
    return undefined;
  }

  const selectedSubtree = taskSubtree(allTasks, taskId);
  const neighborSubtree = taskSubtree(allTasks, neighbor.id);
  const ranks = [...selectedSubtree, ...neighborSubtree]
    .map((candidate) => candidate.rank)
    .toSorted((left, right) => left - right);
  const reordered =
    direction === "up"
      ? [...selectedSubtree, ...neighborSubtree]
      : [...neighborSubtree, ...selectedSubtree];

  return reordered.map((candidate, rankIndex) => ({
    taskId: candidate.id,
    rank: ranks[rankIndex] ?? candidate.rank,
  }));
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
  rank?: number;
};

type TaskWriteStore = {
  toArray: ReadonlyArray<Task>;
  get: (id: string) => Task | undefined;
  update: (id: string, updater: (draft: WritableTaskDraft) => void) => void;
};

function taskById(tasks: ReadonlyArray<Task>): Map<string, Task> {
  return new Map(tasks.map((task) => [task.id, task]));
}

function rootOf(task: Task, byId: ReadonlyMap<string, Task>): Task {
  const seen = new Set<string>();
  let current = task;
  while (current.parentId !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (parent === undefined) {
      break;
    }
    current = parent;
  }
  return current;
}

export function hasDivergentSubtreePlacement(tasks: ReadonlyArray<Task>): boolean {
  const byId = taskById(tasks);
  return tasks.some((task) => {
    if (task.parentId === undefined) {
      return false;
    }

    const root = rootOf(task, byId);
    return root.id !== task.id && !placementsMatch(task, root);
  });
}

export function repairSubtreePlacements(tasks: {
  toArray: ReadonlyArray<Task>;
  update: (id: string, updater: (draft: WritableTaskDraft) => void) => void;
}): boolean {
  const byId = taskById(tasks.toArray);
  let changed = false;
  for (const task of tasks.toArray) {
    if (task.parentId === undefined) {
      continue;
    }

    const root = rootOf(task, byId);
    if (root.id === task.id || placementsMatch(task, root)) {
      continue;
    }

    tasks.update(task.id, (draft) => {
      applyPlacement(draft, taskPlacement(root));
    });
    changed = true;
  }

  return changed;
}

export function applySubtreeMove(
  tasks: TaskWriteStore,
  rootId: string,
  placement: TaskPlacement,
  startRank: number,
): void {
  const descendants = descendantTaskIds(tasks.toArray, rootId)
    .map((id) => tasks.get(id))
    .filter((task): task is Task => task !== undefined)
    .toSorted((left, right) => left.rank - right.rank);

  tasks.update(rootId, (draft) => {
    applyPlacement(draft, placement);
    draft.rank = startRank;
    clearOptional(draft, "parentId");
  });

  for (const [index, child] of descendants.entries()) {
    tasks.update(child.id, (draft) => {
      applyPlacement(draft, placement);
      draft.rank = startRank + 1 + index;
    });
  }
}

export function applySubtreeNest(
  tasks: TaskWriteStore,
  taskId: string,
  parentId: string | undefined,
): void {
  const parent = parentId === undefined ? undefined : tasks.get(parentId);
  const placement = parent === undefined ? undefined : taskPlacement(parent);
  const ids = [taskId, ...descendantTaskIds(tasks.toArray, taskId)];

  for (const id of ids) {
    tasks.update(id, (draft) => {
      if (id === taskId) {
        if (parentId === undefined) {
          clearOptional(draft, "parentId");
        } else {
          draft.parentId = parentId;
        }
      }

      if (placement !== undefined) {
        applyPlacement(draft, placement);
      }
    });
  }
}

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
        clearOptional(draft, "laneId");
      });
      changed = true;
      continue;
    }

    if (task.laneId === todayLaneId) {
      input.tasks.update(task.id, (draft) => {
        clearOptional(draft, "laneId");
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

export function normalizeStoredBoard(input: {
  lanes: {
    toArray: ReadonlyArray<Lane>;
    has: (id: string) => boolean;
    delete: (id: string) => void;
  };
  tasks: {
    toArray: ReadonlyArray<Task>;
    get: (id: string) => Task | undefined;
    update: (id: string, updater: (draft: WritableTaskDraft) => void) => void;
  };
  now?: Date;
}): boolean {
  const migrated = migrateLegacySystemLanes(input);
  const orphans = repairOrphanLaneAssignments(input);
  const repaired = repairSubtreePlacements(input.tasks);
  return migrated || orphans || repaired;
}

export function boardNeedsNormalize(
  lanes: ReadonlyArray<Lane>,
  tasks: ReadonlyArray<Task>,
): boolean {
  return (
    lanes.some(isSystemLane) ||
    tasks.some((task) => task.laneId === inboxLaneId || task.laneId === todayLaneId) ||
    hasOrphanLaneAssignment(lanes, tasks) ||
    hasDivergentSubtreePlacement(tasks)
  );
}

type TaskCompletionStore = {
  toArray: ReadonlyArray<Task>;
  has: (id: string) => boolean;
  get: (id: string) => Task | undefined;
  update: (id: string, updater: (draft: { completed: boolean }) => void) => void;
};

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
