import type { BoardClient } from "~/board/sync/client";
import type { HorizontalDirection, Task, VerticalDirection } from "~/board/types";
import {
  applySubtreeMove,
  applySubtreeNest,
  boardViewIds,
  completeTaskAndDescendants,
  currentViewId,
  inboxLaneId,
  isTaskInView,
  placementForCreate,
  placementForMove,
  planNest,
  todayLaneId,
} from "~/board/views";

function laneTasks(client: BoardClient, viewId: string): Task[] {
  if (viewId === inboxLaneId) {
    return client.inbox.toArray;
  }

  if (viewId === todayLaneId) {
    return client.today.toArray;
  }

  return client.tasks.toArray
    .filter((task) => !task.completed && isTaskInView(task, viewId))
    .toSorted((left, right) => left.rank - right.rank);
}

function nextRank(tasks: ReadonlyArray<Task>): number {
  return tasks.reduce((max, task) => Math.max(max, task.rank), -1) + 1;
}

function mutateBoard(client: BoardClient, apply: () => void) {
  const transaction = client.offline.createOfflineTransaction({
    autoCommit: false,
    mutationFnName: "persistBoard",
  });
  transaction.mutate(apply);
  void transaction.commit();
}

export function addLane(client: BoardClient, title = "New lane"): string {
  const rank = client.lanes.toArray.reduce((max, lane) => Math.max(max, lane.rank), -1) + 1;
  const id = crypto.randomUUID();
  mutateBoard(client, () => {
    client.lanes.insert({
      id,
      title,
      caption: "A place for this work.",
      colour: "blue",
      shape: "diamond",
      rank,
    });
  });
  return id;
}

export function addTask(
  client: BoardClient,
  input: { id: string; laneId: string; title: string; date?: string },
) {
  const title = input.title.trim();
  if (title === "") {
    return;
  }

  const rank = nextRank(laneTasks(client, input.laneId));
  const placement = placementForCreate(input.laneId, input.date);
  mutateBoard(client, () => {
    client.tasks.insert({
      id: input.id,
      title,
      rank,
      completed: false,
      ...placement,
    });
  });
}

export function completeTask(client: BoardClient, taskId: string) {
  if (!client.tasks.has(taskId)) {
    return;
  }

  mutateBoard(client, () => {
    completeTaskAndDescendants(client.tasks, taskId);
  });
}

export function nestTask(
  client: BoardClient,
  taskId: string,
  delta: 1 | -1,
  viewId?: string | null,
) {
  const task = client.tasks.get(taskId);
  if (task === undefined) {
    return;
  }

  const update = planNest(
    laneTasks(client, viewId ?? currentViewId(task)),
    taskId,
    delta,
    client.tasks.toArray,
  );
  if (update === undefined) {
    return;
  }

  mutateBoard(client, () => {
    applySubtreeNest(client.tasks, taskId, update.parentId);
  });
}

export function moveTaskInLane(
  client: BoardClient,
  taskId: string,
  direction: VerticalDirection,
  viewId?: string | null,
) {
  const task = client.tasks.get(taskId);
  if (task === undefined) {
    return;
  }

  const tasks = laneTasks(client, viewId ?? currentViewId(task));
  const index = tasks.findIndex((candidate) => candidate.id === taskId);
  const target = direction === "up" ? index - 1 : index + 1;
  const swap = tasks[target];
  if (index < 0 || swap === undefined) {
    return;
  }

  mutateBoard(client, () => {
    client.tasks.update(taskId, (draft) => {
      draft.rank = swap.rank;
      if (target === 0) {
        delete draft.parentId;
      }
    });
    client.tasks.update(swap.id, (draft) => {
      draft.rank = task.rank;
    });
  });
}

export function moveTaskToLane(
  client: BoardClient,
  taskId: string,
  direction: HorizontalDirection,
  viewId?: string | null,
): string | undefined {
  const task = client.tasks.get(taskId);
  if (task === undefined) {
    return undefined;
  }

  const views = boardViewIds(client.lanes.toArray);
  const index = views.indexOf(viewId ?? currentViewId(task));
  const destination = views[direction === "left" ? index - 1 : index + 1];
  if (index < 0 || destination === undefined) {
    return undefined;
  }

  const rank = nextRank(laneTasks(client, destination));
  const placement = placementForMove(destination, task);
  mutateBoard(client, () => {
    applySubtreeMove(client.tasks, taskId, placement, rank);
  });

  return destination;
}
