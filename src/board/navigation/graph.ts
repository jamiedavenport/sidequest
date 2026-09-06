import { Option } from "effect";
import type { BoardLane, Task } from "~/board/types";
import { currentViewId, isTaskInView, todayLaneId } from "~/board/views";
import type { TaskRef } from "./model";

interface TaskNode {
  readonly target: TaskRef;
  readonly task: Task;
  readonly previousVisible: TaskNode | undefined;
  readonly nextVisible: TaskNode | undefined;
  readonly parent: TaskNode | undefined;
  readonly children: readonly TaskNode[];
}

export interface LaneNode {
  readonly id: string;
  readonly lane: BoardLane;
  readonly previous: LaneNode | undefined;
  readonly next: LaneNode | undefined;
  readonly firstVisible: TaskNode | undefined;
  readonly lastVisible: TaskNode | undefined;
}

export interface BoardGraph {
  readonly firstLane: LaneNode | undefined;
  lane(viewId: string): Option.Option<LaneNode>;
  task(target: TaskRef): Option.Option<TaskNode>;
  visibleTask(target: TaskRef): Option.Option<TaskNode>;
  occurrences(taskId: string): readonly TaskNode[];
  firstVisibleOccurrence(taskId: string): Option.Option<TaskNode>;
}

type MutableTaskNode = { -readonly [K in keyof TaskNode]: TaskNode[K] };

type MutableLaneNode = { -readonly [K in keyof LaneNode]: LaneNode[K] };

type GraphIndexes = {
  byView: Map<string, Map<string, MutableTaskNode>>;
  visible: Map<string, Map<string, MutableTaskNode>>;
  byTask: Map<string, TaskNode[]>;
  firstVisible: Map<string, TaskNode>;
  laneNodes: Map<string, MutableLaneNode>;
};

function snapshotTask(task: Task): Task {
  return Object.freeze({
    ...task,
    ...(task.attachments === undefined
      ? {}
      : {
          attachments: Object.freeze(
            task.attachments.map((attachment) => Object.freeze({ ...attachment })),
          ),
        }),
  });
}

function snapshotLane(lane: BoardLane): BoardLane {
  return Object.freeze({
    ...lane,
    tasks: Object.freeze(
      lane.tasks.map((task) =>
        Object.freeze({ ...snapshotTask(task), visualDepth: task.visualDepth }),
      ),
    ),
  });
}

function createLaneNodes(lanes: readonly BoardLane[]): Map<string, MutableLaneNode> {
  const laneNodes = new Map<string, MutableLaneNode>();
  let previous: MutableLaneNode | undefined;
  for (const lane of lanes) {
    const node: MutableLaneNode = {
      id: lane.id,
      lane: snapshotLane(lane),
      previous,
      next: undefined,
      firstVisible: undefined,
      lastVisible: undefined,
    };
    if (previous) previous.next = node;
    previous = node;
    laneNodes.set(lane.id, node);
  }
  return laneNodes;
}

function createGraphIndexes(lanes: readonly BoardLane[]): GraphIndexes {
  return {
    laneNodes: createLaneNodes(lanes),
    byView: new Map(lanes.map((lane) => [lane.id, new Map()])),
    visible: new Map(lanes.map((lane) => [lane.id, new Map()])),
    byTask: new Map(),
    firstVisible: new Map(),
  };
}

function includeTask(
  indexes: GraphIndexes,
  viewId: string,
  task: Task,
): MutableTaskNode | undefined {
  const nodes = indexes.byView.get(viewId);
  if (!nodes) return undefined;
  const existing = nodes.get(task.id);
  if (existing) return existing;
  const node: MutableTaskNode = {
    target: Object.freeze({ viewId, taskId: task.id }),
    task,
    previousVisible: undefined,
    nextVisible: undefined,
    parent: undefined,
    children: [],
  };
  nodes.set(task.id, node);
  const occurrences = indexes.byTask.get(task.id) ?? [];
  occurrences.push(node);
  indexes.byTask.set(task.id, occurrences);
  return node;
}

function includeCanonicalTasks(indexes: GraphIndexes, tasks: Iterable<Task>, now: Date): void {
  // A task belongs to its project (or Inbox/Today) and may also occur in Today.
  for (const task of tasks) {
    if (task.completed) continue;
    const viewId = currentViewId(task, now);
    includeTask(indexes, viewId, task);
    if (viewId !== todayLaneId && isTaskInView(task, todayLaneId, now))
      includeTask(indexes, todayLaneId, task);
  }
}

function linkVisibleTasks(
  indexes: GraphIndexes,
  lanes: readonly BoardLane[],
  canonical: ReadonlyMap<string, Task>,
): void {
  // Rendered order is authoritative, including rows arriving ahead of canonical data.
  for (const lane of lanes) {
    const laneNode = indexes.laneNodes.get(lane.id);
    if (!laneNode) continue;
    let previousTask: MutableTaskNode | undefined;
    for (const row of lane.tasks) {
      const node = includeTask(indexes, lane.id, canonical.get(row.id) ?? snapshotTask(row));
      if (!node) continue;
      indexes.visible.get(lane.id)?.set(row.id, node);
      if (!indexes.firstVisible.has(row.id)) indexes.firstVisible.set(row.id, node);
      node.previousVisible = previousTask;
      if (previousTask) previousTask.nextVisible = node;
      else laneNode.firstVisible = node;
      previousTask = node;
    }
    laneNode.lastVisible = previousTask;
  }
}

function linkParents(nodes: ReadonlyMap<string, MutableTaskNode>): void {
  // Iterative coloring cuts one canonical edge per cycle, without recursive stacks.
  const done = new Set<MutableTaskNode>();
  for (const start of nodes.values()) {
    const path = new Set<MutableTaskNode>();
    let node: MutableTaskNode | undefined = start;
    while (node && !done.has(node)) {
      path.add(node);
      const parent: MutableTaskNode | undefined =
        node.task.parentId === undefined ? undefined : nodes.get(node.task.parentId);
      if (parent && !path.has(parent)) node.parent = parent;
      else break;
      node = parent;
    }
    for (const visited of path) done.add(visited);
  }
}

function linkChildren(nodes: ReadonlyMap<string, MutableTaskNode>): void {
  const children = new Map<TaskNode, TaskNode[]>();
  for (const node of nodes.values()) {
    if (!node.parent) continue;
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node);
    children.set(node.parent, siblings);
  }
  for (const node of nodes.values()) node.children = Object.freeze(children.get(node) ?? []);
}

function freezeBoardGraph(indexes: GraphIndexes): BoardGraph {
  const { byView, visible, byTask, firstVisible, laneNodes } = indexes;
  for (const nodes of byView.values()) {
    for (const node of nodes.values()) Object.freeze(node);
  }
  for (const node of laneNodes.values()) Object.freeze(node);
  for (const occurrences of byTask.values()) Object.freeze(occurrences);
  const empty: readonly TaskNode[] = Object.freeze([]);
  return Object.freeze({
    firstLane: laneNodes.values().next().value,
    lane: (viewId: string) => Option.fromUndefinedOr(laneNodes.get(viewId)),
    task: (target: TaskRef) =>
      Option.fromUndefinedOr(byView.get(target.viewId)?.get(target.taskId)),
    visibleTask: (target: TaskRef) =>
      Option.fromUndefinedOr(visible.get(target.viewId)?.get(target.taskId)),
    occurrences: (taskId: string) => byTask.get(taskId) ?? empty,
    firstVisibleOccurrence: (taskId: string) => Option.fromUndefinedOr(firstVisible.get(taskId)),
  });
}

/** Build fresh links in O(tasks + view occurrences), then freeze all published nodes. */
export function buildBoardGraph(
  lanes: readonly BoardLane[],
  tasks: readonly Task[],
  now = new Date(),
): BoardGraph {
  const canonical = new Map(tasks.map((task) => [task.id, snapshotTask(task)]));
  const indexes = createGraphIndexes(lanes);
  includeCanonicalTasks(indexes, canonical.values(), now);
  linkVisibleTasks(indexes, lanes, canonical);
  for (const nodes of indexes.byView.values()) {
    linkParents(nodes);
    linkChildren(nodes);
  }
  return freezeBoardGraph(indexes);
}
