import { createActor } from "xstate";
import { describe, expect, it } from "vitest";

import { boardMachine } from "~/board/navigation/machine";

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
