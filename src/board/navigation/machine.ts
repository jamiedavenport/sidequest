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
  HorizontalDirection,
  VerticalDirection,
} from "~/board/types";

export type { BoardContext };

export type BoardEvent =
  | { type: "board.sync"; lanes: BoardLane[] }
  | { type: "navigate"; direction: VerticalDirection | HorizontalDirection }
  | { type: "lane.select"; laneId: string }
  | { type: "task.select"; taskId: string; laneId?: string }
  | { type: "add.start"; laneId: string }
  | { type: "add.cancel" };

export const boardMachine = setup({
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
  types: {} as {
    context: BoardContext;
    events: BoardEvent;
  },
  actions: {
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
    leaveAdding: assign(({ context }) => leaveAdding(context)),
  },
  guards: {
    canEnterAddingDown: ({ context, event }) =>
      event.type === "navigate" &&
      event.direction === "down" &&
      (isLastTaskInLane(context) || isEmptySelectedLane(context)),
    canLeaveAddingUp: ({ event }) => event.type === "navigate" && event.direction === "up",
    isCursorLaneMissing: ({ context, event }) =>
      event.type === "board.sync" && !event.lanes.some((lane) => lane.id === context.cursor.laneId),
  },
}).createMachine({
  id: "board",
  context: initialBoardContext,
  initial: "navigating",
  states: {
    navigating: {
      on: {
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
        "lane.select": { target: "navigating", actions: "selectLane" },
        "task.select": { target: "navigating", actions: "select" },
      },
    },
  },
});

export const BoardActor = createActorContext(boardMachine);
