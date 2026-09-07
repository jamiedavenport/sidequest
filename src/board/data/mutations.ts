import { planTaskCreate, planTaskUpdate } from "~/board/data/task-planning";
import { emptyNoteDocument, Note, Whiteboard, type Lane } from "~/board/schema";
import { Effect, Schema } from "effect";
import { playDoneSound } from "~/board/sound";
import type { BoardClient } from "~/board/sync/client-types";
import type { HorizontalDirection, Task, VerticalDirection } from "~/board/types";
import {
  applySubtreeNest,
  boardViewIds,
  completeTaskAndDescendants,
  currentViewId,
  deleteTasksForDeletedLane,
  isSystemLane,
  isTaskInView,
  planLaneMove,
  planNest,
  planTaskMove,
  randomLaneSymbol,
  rehomeTasksForDeletedLane,
  type TaskDestination,
  type TaskMoveUpdate,
  type LaneDestination,
} from "~/board/views";

function laneTasks(client: BoardClient, viewId: string): Task[] {
  return client.tasks.toArray
    .filter((task) => !task.completed && isTaskInView(task, viewId))
    .toSorted((left, right) => left.rank - right.rank);
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

class TaskCollapseSaveError extends Schema.TaggedError<TaskCollapseSaveError>()(
  "TaskCollapseSaveError",
  {
    cause: Schema.Defect(),
  },
) {}

export const setTaskCollapsed = Effect.fn("setTaskCollapsed")(function* (
  client: BoardClient,
  taskId: string,
  collapsed: boolean,
) {
  const task = client.tasks.get(taskId);
  if (task === undefined || task.collapsed === collapsed) {
    return false;
  }

  const transaction = client.offline.createOfflineTransaction({
    autoCommit: false,
    mutationFnName: "persistBoard",
  });
  yield* Effect.try({
    try: () => {
      transaction.mutate(() => {
        client.tasks.update(taskId, (draft) => {
          draft.collapsed = collapsed;
        });
      });
    },
    catch: (cause) => new TaskCollapseSaveError({ cause }),
  });
  yield* Effect.tryPromise({
    try: () => transaction.commit(),
    catch: (cause) => new TaskCollapseSaveError({ cause }),
  });

  return true;
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

class BoardMoveError extends Schema.TaggedError<BoardMoveError>()("BoardMoveError", {
  cause: Schema.Defect(),
}) {}

class InvalidBoardMove extends Schema.TaggedError<InvalidBoardMove>()("InvalidBoardMove", {
  message: Schema.String,
}) {}

// Return after optimistic application. The UI observes this Effect independently of interaction state.
const applyBoardMove = Effect.fn("applyBoardMove")(function* (
  client: BoardClient,
  apply: () => void,
) {
  const transaction = yield* Effect.try({
    try: () => {
      const pending = client.offline.createOfflineTransaction({
        autoCommit: false,
        mutationFnName: "persistBoard",
      });
      pending.mutate(apply);
      return pending;
    },
    catch: (cause) => new BoardMoveError({ cause }),
  });
  const commit = transaction.commit();
  // Attach a rejection observer immediately, even if the caller observes completion on the next tick.
  void commit.catch(() => {});
  return {
    completion: Effect.tryPromise({
      try: () => commit,
      catch: (cause) => new BoardMoveError({ cause }),
    }),
  };
});

export const moveLane = Effect.fn("moveLane")(function* (
  client: BoardClient,
  laneId: string,
  direction: HorizontalDirection | LaneDestination,
) {
  const updates = planLaneMove(client.lanes.toArray, laneId, direction);
  if (updates === undefined || updates.length === 0) {
    return undefined;
  }
  const { completion } = yield* applyBoardMove(client, () => {
    for (const update of updates) {
      client.lanes.update(update.laneId, (draft) => {
        draft.rank = update.rank;
      });
    }
  });
  return { viewId: laneId, completion };
});

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

  const task = planTaskCreate(client.tasks.toArray, { ...input, viewId: input.laneId });
  mutateBoard(client, () => {
    client.tasks.insert(task);
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
      Object.assign(draft, planTaskUpdate(task, { title, date: input.date ?? null }));
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

const applyTaskPlan = Effect.fn("applyTaskPlan")(function* (
  client: BoardClient,
  updates: ReadonlyArray<TaskMoveUpdate> | undefined,
  viewId: string,
) {
  if (updates === undefined || updates.length === 0) {
    return undefined;
  }
  const { completion } = yield* applyBoardMove(client, () => {
    for (const update of updates) {
      client.tasks.update(update.taskId, (draft) => {
        Object.assign(draft, update.patch);
      });
    }
  });
  return { viewId, completion };
});

export const nestTask = Effect.fn("nestTask")(function* (
  client: BoardClient,
  taskId: string,
  delta: 1 | -1 | TaskDestination,
  viewId?: string | null,
) {
  if (typeof delta !== "number") {
    return yield* moveTaskInLane(client, taskId, delta, viewId);
  }
  const task = client.tasks.get(taskId);
  if (task === undefined || task.completed) {
    return undefined;
  }
  const sourceViewId = viewId ?? currentViewId(task);
  const update = planNest(laneTasks(client, sourceViewId), taskId, delta, client.tasks.toArray);
  if (update === undefined) {
    return undefined;
  }
  const { completion } = yield* applyBoardMove(client, () => {
    applySubtreeNest(client.tasks, taskId, update.parentId);
  });
  return { viewId: sourceViewId, completion };
});

export const moveTaskInLane = Effect.fn("moveTaskInLane")(function* (
  client: BoardClient,
  taskId: string,
  direction: VerticalDirection | TaskDestination,
  viewId?: string | null,
) {
  const task = client.tasks.get(taskId);
  if (task === undefined || task.completed) {
    return undefined;
  }
  const sourceViewId = viewId ?? currentViewId(task);
  if (
    typeof direction !== "string" &&
    !boardViewIds(client.lanes.toArray).includes(direction.viewId)
  ) {
    return yield* new InvalidBoardMove({ message: "The destination lane is no longer available." });
  }
  const updates = planTaskMove(
    laneTasks(client, sourceViewId),
    client.tasks.toArray,
    taskId,
    direction,
    sourceViewId,
  );
  return yield* applyTaskPlan(
    client,
    updates,
    typeof direction === "string" ? sourceViewId : direction.viewId,
  );
});

export const moveTaskToLane = Effect.fn("moveTaskToLane")(function* (
  client: BoardClient,
  taskId: string,
  direction: HorizontalDirection | TaskDestination,
  viewId?: string | null,
) {
  if (typeof direction !== "string") {
    return yield* moveTaskInLane(client, taskId, direction, viewId);
  }
  const task = client.tasks.get(taskId);
  if (task === undefined || task.completed) {
    return undefined;
  }
  const views = boardViewIds(client.lanes.toArray);
  const sourceViewId = viewId ?? currentViewId(task);
  const index = views.indexOf(sourceViewId);
  const destination = views[direction === "left" ? index - 1 : index + 1];
  if (index < 0 || destination === undefined) {
    return undefined;
  }
  return yield* moveTaskInLane(
    client,
    taskId,
    { viewId: destination, edge: "append" },
    sourceViewId,
  );
});

type BoardMoveResult = Effect.Success<ReturnType<typeof moveLane>>;

export type RunBoardMove = <E>(
  command: Effect.Effect<BoardMoveResult, E>,
  onApplied?: (result: BoardMoveResult) => void,
) => void;

export const DragSource = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("task"), taskId: Schema.String, viewId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("lane"), viewId: Schema.String }),
]);
export type DragSource = typeof DragSource.Type;

const DropTarget = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("task"),
    taskId: Schema.String,
    viewId: Schema.String,
    edge: Schema.Literals(["before", "after", "nest"]),
  }),
  Schema.Struct({
    kind: Schema.Literal("view"),
    viewId: Schema.String,
    edge: Schema.Literal("append"),
  }),
  Schema.Struct({
    kind: Schema.Literal("lane"),
    viewId: Schema.String,
    edge: Schema.Literals(["before", "after"]),
  }),
]);

export type BoardDropTarget = typeof DropTarget.Type;

export const dropBoardEntity = Effect.fn("dropBoardEntity")(function* (
  client: BoardClient,
  sourceInput: unknown,
  targetInput: unknown,
) {
  const source = yield* Schema.decodeUnknownEffect(DragSource)(sourceInput);
  const target = yield* Schema.decodeUnknownEffect(DropTarget)(targetInput);
  const views = boardViewIds(client.lanes.toArray);
  if (!views.includes(source.viewId) || !views.includes(target.viewId)) {
    return yield* new InvalidBoardMove({
      message: "The dragged item or destination is no longer available.",
    });
  }
  if (source.kind === "lane") {
    if (
      target.kind !== "lane" ||
      isSystemLane({ id: source.viewId }) ||
      isSystemLane({ id: target.viewId })
    ) {
      return undefined;
    }
    return yield* moveLane(client, source.viewId, { laneId: target.viewId, edge: target.edge });
  }
  const task = client.tasks.get(source.taskId);
  if (task === undefined || task.completed || !isTaskInView(task, source.viewId)) {
    return undefined;
  }
  if (target.kind === "lane") {
    return undefined;
  }
  if (target.edge === "nest") {
    return yield* nestTask(client, source.taskId, target, source.viewId);
  }
  return yield* source.viewId === target.viewId
    ? moveTaskInLane(client, source.taskId, target, source.viewId)
    : moveTaskToLane(client, source.taskId, target, source.viewId);
});
