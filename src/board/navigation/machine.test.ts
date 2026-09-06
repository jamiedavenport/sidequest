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
