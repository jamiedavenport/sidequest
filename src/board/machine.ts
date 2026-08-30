import { assertEvent, assign, setup } from "xstate";

import {
  addTask,
  cancelAdd,
  createBoard,
  isEmptySelectedLane,
  isLastTaskInLane,
  logComplete,
  moveInLane,
  moveToLane,
  selectHorizontal,
  selectLane,
  selectLaneById,
  selectTask,
  selectVertical,
  setDepth,
  startAdding,
} from "~/board/commands";
import { lanes as seedLanes } from "~/board/data";
import type {
  BoardContext,
  HorizontalDirection,
  Lane,
  LaneKind,
  VerticalDirection,
} from "~/board/types";
import { createActorContext } from "@xstate/react";

export type { BoardContext };

export type BoardInput = {
  lanes?: Lane[];
  selectedId?: string;
};

export type BoardEvent =
  | { type: "navigate"; direction: VerticalDirection | HorizontalDirection }
  | { type: "lane.focus"; kind: Extract<LaneKind, "inbox" | "today"> }
  | { type: "lane.select"; laneId: string }
  | { type: "lane.move"; direction: HorizontalDirection }
  | { type: "task.move"; direction: VerticalDirection }
  | { type: "task.complete"; taskId: string }
  | { type: "task.nest"; delta: 1 | -1 }
  | { type: "task.select"; taskId: string }
  | { type: "add.start"; laneId: string }
  | { type: "add.submit"; title: string; id: string; date?: string }
  | { type: "add.cancel" };

export const boardMachine = setup({
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
  types: {} as {
    context: BoardContext;
    events: BoardEvent;
    input: BoardInput;
  },
  actions: {
    navigate: assign(({ context, event }) => {
      assertEvent(event, "navigate");
      return event.direction === "up" || event.direction === "down"
        ? selectVertical(context, event.direction)
        : selectHorizontal(context, event.direction);
    }),
    focusLane: assign(({ context, event }) => {
      assertEvent(event, "lane.focus");
      return selectLane(context, event.kind);
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
    moveLane: assign(({ context, event }) => {
      assertEvent(event, "lane.move");
      return moveToLane(context, event.direction);
    }),
    moveTask: assign(({ context, event }) => {
      assertEvent(event, "task.move");
      return moveInLane(context, event.direction);
    }),
    complete: ({ context, event }) => {
      assertEvent(event, "task.complete");
      logComplete(context, event.taskId);
    },
    nest: assign(({ context, event }) => {
      assertEvent(event, "task.nest");
      return setDepth(context, event.delta);
    }),
    select: assign(({ context, event }) => {
      assertEvent(event, "task.select");
      return selectTask(context, event.taskId);
    }),
    add: assign(({ context, event }) => {
      assertEvent(event, "add.submit");
      return addTask(context, event.title, event.id, event.date);
    }),
    cancelAdd: assign(({ context }) => cancelAdd(context)),
  },
  guards: {
    canEnterAddingDown: ({ context, event }) =>
      event.type === "navigate" &&
      event.direction === "down" &&
      (isLastTaskInLane(context) || isEmptySelectedLane(context)),
    canAddTask: ({ event }) => event.type === "add.submit" && event.title.trim() !== "",
  },
}).createMachine({
  id: "board",
  context: ({ input }) => createBoard(input?.lanes ?? seedLanes, input?.selectedId),
  initial: "navigating",
  states: {
    navigating: {
      on: {
        navigate: [
          {
            guard: "canEnterAddingDown",
            target: "adding",
            actions: "enterAddingFromSelection",
          },
          { actions: "navigate" },
        ],
        "lane.focus": { actions: "focusLane" },
        "lane.select": { actions: "selectLane" },
        "lane.move": { actions: "moveLane" },
        "task.move": { actions: "moveTask" },
        "task.complete": { actions: "complete" },
        "task.nest": { actions: "nest" },
        "task.select": { actions: "select" },
        "add.start": { target: "adding", actions: "enterAdding" },
      },
    },
    adding: {
      on: {
        "add.submit": { guard: "canAddTask", actions: "add" },
        "add.cancel": { target: "navigating", actions: "cancelAdd" },
        "add.start": { actions: "enterAdding" },
        "lane.focus": { target: "navigating", actions: "focusLane" },
        "lane.select": { target: "navigating", actions: "selectLane" },
        "task.select": { target: "navigating", actions: "select" },
      },
    },
  },
});

export const BoardActor = createActorContext(boardMachine);
