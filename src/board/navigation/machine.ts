import { assertEvent, assign, setup } from "xstate";
import { createActorContext } from "@xstate/react";

import {
  initialBoardContext,
  isEmptySelectedLane,
  isLastTaskInLane,
  leaveAdding,
  selectHorizontal,
  selectLaneById,
  selectTask,
  selectVertical,
  startAdding,
  syncBoard,
} from "~/board/navigation/commands";
import type {
  BoardContext,
  BoardLane,
  DetailTab,
  HorizontalDirection,
  VerticalDirection,
} from "~/board/types";

export type { BoardContext };

export type BoardEvent =
  | { type: "drag.start"; source: NonNullable<BoardContext["drag"]> }
  | { type: "drag.finish"; viewId: string }
  | { type: "drag.cancel" }
  | { type: "board.sync"; lanes: BoardLane[] }
  | { type: "navigate"; direction: VerticalDirection | HorizontalDirection }
  | { type: "lane.select"; laneId: string }
  | { type: "task.select"; taskId: string; laneId?: string }
  | { type: "task.created"; taskId: string; laneId: string }
  | { type: "edit.start"; taskId: string; laneId: string }
  | { type: "edit.cancel" }
  | { type: "edit.save" }
  | { type: "details.open"; taskId: string; laneId: string; tab: DetailTab }
  | { type: "details.tab.select"; tab: DetailTab }
  | { type: "details.close" }
  | { type: "add.start"; laneId: string }
  | { type: "add.cancel" };

export const boardMachine = setup({
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
  types: {} as {
    context: BoardContext;
    events: BoardEvent;
  },
  actions: {
    startDrag: assign(({ context, event }) => {
      assertEvent(event, "drag.start");
      const source = event.source;
      return {
        ...(source.kind === "task"
          ? selectTask(context, source.taskId, source.viewId)
          : selectLaneById(context, source.viewId)),
        drag: source,
      };
    }),
    finishDrag: assign(({ context, event }) => {
      assertEvent(event, "drag.finish");
      const source = context.drag;
      return {
        ...(source?.kind === "task"
          ? selectTask(context, source.taskId, event.viewId)
          : selectLaneById(context, event.viewId)),
        drag: undefined,
      };
    }),
    clearDrag: assign({ drag: undefined }),
    syncBoard: assign(({ context, event }) => {
      assertEvent(event, "board.sync");
      return syncBoard(context, event.lanes);
    }),
    navigate: assign(({ context, event }) => {
      assertEvent(event, "navigate");
      return event.direction === "up" || event.direction === "down"
        ? selectVertical(context, event.direction)
        : selectHorizontal(context, event.direction);
    }),
    selectLane: assign(({ context, event }) => {
      assertEvent(event, "lane.select");
      return selectLaneById(context, event.laneId);
    }),
    enterAddingFromSelection: assign(({ context }) => selectVertical(context, "down")),
    enterAdding: assign(({ context, event }) => {
      assertEvent(event, "add.start");
      return startAdding(context, event.laneId);
    }),
    select: assign(({ context, event }) => {
      assertEvent(event, "task.select");
      return selectTask(context, event.taskId, event.laneId);
    }),
    selectCreated: assign(({ context, event }) => {
      assertEvent(event, "task.created");
      return selectTask(context, event.taskId, event.laneId);
    }),
    selectEdited: assign(({ context, event }) => {
      assertEvent(event, "edit.start");
      return selectTask(context, event.taskId, event.laneId);
    }),
    selectDetailed: assign(({ context, event }) => {
      assertEvent(event, "details.open");
      return {
        ...selectTask(context, event.taskId, event.laneId),
        detailTab: event.tab,
      };
    }),
    selectDetailTab: assign(({ context, event }) => {
      assertEvent(event, "details.tab.select");
      return { ...context, detailTab: event.tab };
    }),
    leaveAdding: assign(({ context }) => leaveAdding(context)),
  },
  guards: {
    canDrag: ({ context, event }) => {
      if (event.type !== "drag.start") return false;
      const source = event.source;
      const lane = context.lanes.find((item) => item.id === source.viewId);
      return (
        lane !== undefined &&
        (source.kind === "task"
          ? lane.tasks.some((task) => task.id === source.taskId)
          : source.viewId !== "today" && source.viewId !== "inbox")
      );
    },
    isDraggedEntityMissing: ({ context, event }) => {
      if (event.type !== "board.sync" || context.drag === undefined) return false;
      const source = context.drag;
      const lane = event.lanes.find((item) => item.id === source.viewId);
      return (
        lane === undefined ||
        (source.kind === "task" && !lane.tasks.some((task) => task.id === source.taskId))
      );
    },
    canEnterAddingDown: ({ context, event }) =>
      event.type === "navigate" &&
      event.direction === "down" &&
      (isLastTaskInLane(context) || isEmptySelectedLane(context)),
    canLeaveAddingUp: ({ event }) => event.type === "navigate" && event.direction === "up",
    isCursorLaneMissing: ({ context, event }) =>
      event.type === "board.sync" && !event.lanes.some((lane) => lane.id === context.cursor.laneId),
    isEditedTaskMissing: ({ context, event }) => {
      if (event.type !== "board.sync") {
        return false;
      }

      if (context.cursor.taskId === null) {
        return true;
      }

      const lane = event.lanes.find((candidate) => candidate.id === context.cursor.laneId);
      return lane === undefined || !lane.tasks.some((task) => task.id === context.cursor.taskId);
    },
    isOpenDetailTaskUnavailable: ({ context, event }) => {
      if (event.type !== "board.sync" || context.cursor.taskId === null) {
        return true;
      }

      const lane = event.lanes.find((candidate) => candidate.id === context.cursor.laneId);
      return lane === undefined || !lane.tasks.some((task) => task.id === context.cursor.taskId);
    },
  },
}).createMachine({
  id: "board",
  context: initialBoardContext,
  initial: "navigating",
  states: {
    navigating: {
      on: {
        "drag.start": { guard: "canDrag", target: "dragging", actions: "startDrag" },
        "board.sync": { actions: "syncBoard" },
        navigate: [
          {
            guard: "canEnterAddingDown",
            target: "adding",
            actions: "enterAddingFromSelection",
          },
          { actions: "navigate" },
        ],
        "lane.select": { actions: "selectLane" },
        "task.select": { actions: "select" },
        "edit.start": { target: "editing", actions: "selectEdited" },
        "details.open": { target: "details", actions: "selectDetailed" },
        "add.start": { target: "adding", actions: "enterAdding" },
      },
    },
    dragging: {
      on: {
        "drag.finish": { target: "navigating", actions: "finishDrag" },
        "drag.cancel": { target: "navigating", actions: "clearDrag" },
        "board.sync": [
          {
            guard: "isDraggedEntityMissing",
            target: "navigating",
            actions: ["syncBoard", "clearDrag"],
          },
          { actions: "syncBoard" },
        ],
      },
    },
    details: {
      on: {
        "details.open": { actions: "selectDetailed" },
        "details.tab.select": { actions: "selectDetailTab" },
        "details.close": { target: "navigating" },
        "board.sync": [
          {
            guard: "isOpenDetailTaskUnavailable",
            target: "navigating",
            actions: "syncBoard",
          },
          { actions: "syncBoard" },
        ],
      },
    },
    editing: {
      on: {
        "board.sync": [
          {
            guard: "isEditedTaskMissing",
            target: "navigating",
            actions: "syncBoard",
          },
          { actions: "syncBoard" },
        ],
        "edit.start": { actions: "selectEdited" },
        "edit.cancel": { target: "navigating" },
        "edit.save": { target: "navigating" },
        "task.select": { target: "navigating", actions: "select" },
        "lane.select": { target: "navigating", actions: "selectLane" },
        "add.start": { target: "adding", actions: "enterAdding" },
      },
    },
    adding: {
      on: {
        "board.sync": [
          {
            guard: "isCursorLaneMissing",
            target: "navigating",
            actions: "syncBoard",
          },
          { actions: "syncBoard" },
        ],
        navigate: {
          guard: "canLeaveAddingUp",
          target: "navigating",
          actions: "leaveAdding",
        },
        "add.cancel": { target: "navigating" },
        "add.start": { actions: "enterAdding" },
        "edit.start": { target: "editing", actions: "selectEdited" },
        "lane.select": { target: "navigating", actions: "selectLane" },
        "task.select": { target: "navigating", actions: "select" },
        "task.created": { actions: "selectCreated" },
      },
    },
  },
});

export const BoardActor = createActorContext(boardMachine);
