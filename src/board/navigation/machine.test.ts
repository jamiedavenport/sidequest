import { createActor } from "xstate";
import { describe, expect, it } from "vitest";

import { boardMachine } from "~/board/navigation/machine";
import { syncBoard } from "~/board/navigation/commands";
import type { BoardContext, BoardLane } from "~/board/types";

function lane(tasks: BoardLane["tasks"]): BoardLane {
  return {
    id: "lane",
    title: "Lane",
    colour: "green",
    shape: "square",
    rank: 0,
    tasks,
  };
}

function boardTask(id: string, parentId?: string): BoardLane["tasks"][number] {
  return {
    id,
    title: id,
    rank: 0,
    completed: false,
    collapsed: false,
    visualDepth: parentId === undefined ? 0 : 1,
    ...(parentId === undefined ? {} : { parentId }),
  };
}

describe("boardMachine", () => {
  it("stays in the add form after creating a task", () => {
    const actor = createActor(boardMachine).start();

    actor.send({ type: "add.start", laneId: "lane" });
    actor.send({ type: "task.created", taskId: "created-task", laneId: "lane" });

    expect(actor.getSnapshot().value).toBe("adding");
    expect(actor.getSnapshot().context.cursor).toEqual({
      laneId: "lane",
      taskId: "created-task",
    });

    actor.stop();
  });
});

describe("syncBoard", () => {
  it("selects the nearest visible ancestor when collapse hides the selected task", () => {
    const root = boardTask("root");
    const parent = { ...boardTask("parent", "root"), visualDepth: 1 };
    const child = { ...boardTask("child", "parent"), visualDepth: 2 };
    const context: BoardContext = {
      lanes: [lane([root, parent, child])],
      cursor: { laneId: "lane", taskId: "child" },
      detailTab: "notes",
    };

    const next = syncBoard(context, [lane([{ ...root, collapsed: true }])]);

    expect(next.cursor).toEqual({ laneId: "lane", taskId: "root" });
  });
});

describe("board dragging", () => {
  function draggingActor() {
    const actor = createActor(boardMachine).start();
    actor.send({
      type: "board.sync",
      lanes: [{ ...lane([]), id: "today" }, lane([boardTask("first"), boardTask("second")])],
    });
    actor.send({ type: "drag.start", source: { kind: "task", taskId: "first", viewId: "lane" } });
    return actor;
  }

  it("suppresses navigation and editing while processing board synchronization", () => {
    const actor = draggingActor();
    actor.send({ type: "navigate", direction: "down" });
    actor.send({ type: "task.select", taskId: "second", laneId: "lane" });
    actor.send({ type: "add.start", laneId: "lane" });
    actor.send({ type: "edit.start", taskId: "second", laneId: "lane" });
    actor.send({ type: "details.open", taskId: "second", laneId: "lane", tab: "notes" });
    actor.send({ type: "board.sync", lanes: [lane([boardTask("first"), boardTask("new")])] });
    expect(actor.getSnapshot().value).toBe("dragging");
    expect(actor.getSnapshot().context.cursor.taskId).toBe("first");
    expect(actor.getSnapshot().context.lanes[0]?.tasks[1]?.id).toBe("new");
    actor.stop();
  });

  it("finishes in the destination view and clears the drag", () => {
    const actor = draggingActor();
    actor.send({ type: "drag.finish", viewId: "today" });
    expect(actor.getSnapshot().value).toBe("navigating");
    expect(actor.getSnapshot().context.cursor).toEqual({ laneId: "today", taskId: "first" });
    expect(actor.getSnapshot().context.drag).toBeUndefined();
    actor.stop();
  });

  it("cancels without moving selection", () => {
    const actor = draggingActor();
    actor.send({ type: "drag.cancel" });
    expect(actor.getSnapshot().value).toBe("navigating");
    expect(actor.getSnapshot().context.cursor.taskId).toBe("first");
    expect(actor.getSnapshot().context.drag).toBeUndefined();
    actor.stop();
  });

  it("cancels if synchronization removes the dragged entity", () => {
    const actor = draggingActor();
    actor.send({ type: "board.sync", lanes: [lane([boardTask("second")])] });
    expect(actor.getSnapshot().value).toBe("navigating");
    expect(actor.getSnapshot().context.drag).toBeUndefined();
    expect(actor.getSnapshot().context.cursor.taskId).toBe("second");
    actor.stop();
  });

  it.each(["editing", "adding", "details"] as const)("cannot start from %s", (mode) => {
    const actor = createActor(boardMachine).start();
    actor.send({ type: "board.sync", lanes: [lane([boardTask("first")])] });
    if (mode === "editing") actor.send({ type: "edit.start", taskId: "first", laneId: "lane" });
    if (mode === "adding") actor.send({ type: "add.start", laneId: "lane" });
    if (mode === "details")
      actor.send({ type: "details.open", taskId: "first", laneId: "lane", tab: "notes" });
    actor.send({ type: "drag.start", source: { kind: "task", taskId: "first", viewId: "lane" } });
    expect(actor.getSnapshot().value).toBe(mode);
    actor.stop();
  });

  it("keeps system lanes fixed", () => {
    const actor = createActor(boardMachine).start();
    actor.send({ type: "drag.start", source: { kind: "lane", viewId: "today" } });
    expect(actor.getSnapshot().value).toBe("navigating");
    actor.stop();
  });
});
