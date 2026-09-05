import { emptyNoteDocument, Note, Whiteboard, type Lane } from "~/board/schema";
import { Effect, Schema } from "effect";
import { playDoneSound } from "~/board/sound";
import type { BoardClient } from "~/board/sync/client";
import type { HorizontalDirection, Task, VerticalDirection } from "~/board/types";
import {
  applySubtreeMove,
  applySubtreeNest,
  boardViewIds,
  completeTaskAndDescendants,
  currentViewId,
  deleteTasksForDeletedLane,
  inboxLaneId,
  isSystemLane,
  isTaskInView,
  placementForCreate,
  placementForMove,
  planLaneMove,
  planNest,
  planTaskMove,
  randomLaneSymbol,
  rehomeTasksForDeletedLane,
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

class NoteSaveError extends Schema.TaggedError<NoteSaveError>()("NoteSaveError", {
  cause: Schema.Defect(),
}) {}

export const saveNote = Effect.fn("saveNote")(function* (client: BoardClient, input: unknown) {
  const note = yield* Schema.decodeUnknownEffect(Note)(input);
  const transaction = client.offline.createOfflineTransaction({
    autoCommit: false,
    mutationFnName: "persistBoard",
  });

  yield* Effect.sync(() => {
    transaction.mutate(() => {
      if (client.notes.has(note.taskId)) {
        client.notes.update(note.taskId, (draft) => {
          Object.assign(draft, { content: note.content });
        });
      } else {
        client.notes.insert(note);
      }
    });
  });

  yield* Effect.tryPromise({
    try: () => transaction.commit(),
    catch: (cause) => new NoteSaveError({ cause }),
  });
});

class WhiteboardSaveError extends Schema.TaggedError<WhiteboardSaveError>()("WhiteboardSaveError", {
  cause: Schema.Defect(),
}) {}

export const saveWhiteboard = Effect.fn("saveWhiteboard")(function* (
  client: BoardClient,
  input: unknown,
) {
  const whiteboard = yield* Schema.decodeUnknownEffect(Whiteboard)(input);
  const transaction = client.offline.createOfflineTransaction({
    autoCommit: false,
    mutationFnName: "persistBoard",
  });

  yield* Effect.try({
    try: () => {
      transaction.mutate(() => {
        const task = client.tasks.get(whiteboard.taskId);
        if (task === undefined || task.completed) {
          throw new Error("Whiteboards require an active task");
        }

        if (client.whiteboards.has(whiteboard.taskId)) {
          client.whiteboards.update(whiteboard.taskId, (draft) => {
            Object.assign(draft, { document: whiteboard.document });
          });
        } else {
          client.whiteboards.insert(whiteboard);
        }
      });
    },
    catch: (cause) => new WhiteboardSaveError({ cause }),
  });

  yield* Effect.tryPromise({
    try: () => transaction.commit(),
    catch: (cause) => new WhiteboardSaveError({ cause }),
  });
});

export function addLane(client: BoardClient, title = "New lane"): string {
  const rank = client.lanes.toArray.reduce((max, lane) => Math.max(max, lane.rank), -1) + 1;
  const id = crypto.randomUUID();
  const symbol = randomLaneSymbol();
  mutateBoard(client, () => {
    client.lanes.insert({
      id,
      title,
      colour: symbol.colour,
      shape: symbol.shape,
      rank,
    });
  });
  return id;
}

export function updateLane(
  client: BoardClient,
  laneId: string,
  patch: Partial<Pick<Lane, "title" | "colour" | "shape">>,
) {
  if (isSystemLane({ id: laneId }) || !client.lanes.has(laneId)) {
    return;
  }

  const nextTitle = patch.title === undefined ? undefined : patch.title.trim();
  if (nextTitle === "") {
    return;
  }

  mutateBoard(client, () => {
    client.lanes.update(laneId, (draft) => {
      if (nextTitle !== undefined) {
        draft.title = nextTitle;
      }
      if (patch.colour !== undefined) {
        draft.colour = patch.colour;
      }
      if (patch.shape !== undefined) {
        draft.shape = patch.shape;
      }
    });
  });
}

export function moveLane(client: BoardClient, laneId: string, direction: HorizontalDirection) {
  if (isSystemLane({ id: laneId })) {
    return;
  }

  const swaps = planLaneMove(client.lanes.toArray, laneId, direction);
  if (swaps === undefined) {
    return;
  }

  mutateBoard(client, () => {
    for (const swap of swaps) {
      client.lanes.update(swap.laneId, (draft) => {
        draft.rank = swap.rank;
      });
    }
  });
}

export function deleteLane(client: BoardClient, laneId: string, input: { deleteTasks: boolean }) {
  if (isSystemLane({ id: laneId }) || !client.lanes.has(laneId)) {
    return;
  }

  mutateBoard(client, () => {
    if (input.deleteTasks) {
      const taskIds = client.tasks.toArray
        .filter((task) => task.laneId === laneId)
        .map((task) => task.id);
      deleteTasksForDeletedLane(client.tasks, laneId);
      for (const taskId of taskIds) {
        if (client.notes.has(taskId)) {
          client.notes.delete(taskId);
        }
        if (client.whiteboards.has(taskId)) {
          client.whiteboards.delete(taskId);
        }
      }
    } else {
      rehomeTasksForDeletedLane(client.tasks, laneId);
    }
    client.lanes.delete(laneId);
  });
}

export function requestRemoveLane(
  client: BoardClient,
  laneId: string,
  confirm: (laneId: string) => void,
) {
  if (isSystemLane({ id: laneId }) || !client.lanes.has(laneId)) {
    return;
  }

  const hasVisibleTasks = client.tasks.toArray.some(
    (task) => task.laneId === laneId && !task.completed,
  );
  if (hasVisibleTasks) {
    confirm(laneId);
    return;
  }

  deleteLane(client, laneId, { deleteTasks: false });
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
    client.notes.insert({ taskId: input.id, content: emptyNoteDocument() });
  });
}

export function updateTask(
  client: BoardClient,
  taskId: string,
  input: { title: string; date?: string },
) {
  const task = client.tasks.get(taskId);
  const title = input.title.trim();
  if (task === undefined || title === "") {
    return;
  }

  const titleChanged = task.title !== title;
  if (!titleChanged && task.date === input.date) {
    return;
  }

  mutateBoard(client, () => {
    client.tasks.update(taskId, (draft) => {
      draft.title = title;
      if (input.date === undefined) {
        delete draft.date;
      } else {
        draft.date = input.date;
      }
      if (titleChanged) {
        draft.attachments = [];
      }
    });
  });
}

export function completeTask(client: BoardClient, taskId: string) {
  const task = client.tasks.get(taskId);
  if (task === undefined || task.completed) {
    return;
  }

  mutateBoard(client, () => {
    completeTaskAndDescendants(client.tasks, taskId);
  });
  playDoneSound();
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
  const updates = planTaskMove(tasks, client.tasks.toArray, taskId, direction);
  if (updates === undefined) {
    return;
  }

  mutateBoard(client, () => {
    for (const update of updates) {
      client.tasks.update(update.taskId, (draft) => {
        draft.rank = update.rank;
      });
    }
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
