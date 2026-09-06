import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  completeTask,
  dropBoardEntity,
  moveLane,
  moveTaskInLane,
  moveTaskToLane,
  nestTask,
  setTaskCollapsed,
} from "~/board/data/mutations";
import type { BoardClient } from "~/board/sync/client";
import type { Task } from "~/board/types";
import { completeTasks } from "~/board/views";

type TaskFixture = {
  id: string;
  children: ReadonlyArray<TaskFixture>;
  laneId?: string;
};

function task(
  id: string,
  children: ReadonlyArray<TaskFixture> = [],
  options: { laneId?: string } = {},
): TaskFixture {
  return {
    id,
    children,
    ...options,
  };
}

function materializeTasks(fixtures: ReadonlyArray<TaskFixture>): Task[] {
  const tasks: Task[] = [];
  const nextRanks = new Map<string, number>();

  function visit(nodes: ReadonlyArray<TaskFixture>, parentId?: string, inheritedLaneId = "lane") {
    for (const node of nodes) {
      const laneId = node.laneId ?? inheritedLaneId;
      const rank = nextRanks.get(laneId) ?? 0;
      nextRanks.set(laneId, rank + 1);
      tasks.push({
        id: node.id,
        title: node.id,
        rank,
        completed: false,
        collapsed: false,
        laneId,
        ...(parentId === undefined ? {} : { parentId }),
      });
      visit(node.children, node.id, laneId);
    }
  }

  visit(fixtures);
  return tasks;
}

function testClient(initialTasks: ReadonlyArray<TaskFixture>): BoardClient {
  const tasks = materializeTasks(initialTasks);
  const lanes = ["lane-left", "lane", "lane-right"].map((id, rank) => ({
    id,
    title: id,
    colour: "green" as const,
    shape: "square" as const,
    rank,
  }));

  // The movement functions only use these synchronous BoardClient surfaces.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return {
    lanes: {
      toArray: lanes,
      update: (id: string, updater: (draft: (typeof lanes)[number]) => void) => {
        const draft = lanes.find((item) => item.id === id);
        if (draft !== undefined) updater(draft);
      },
    },
    tasks: {
      get toArray() {
        return tasks;
      },
      has: (id: string) => tasks.some((item) => item.id === id),
      get: (id: string) => tasks.find((item) => item.id === id),
      update: (id: string, updater: (draft: Task) => void) => {
        const draft = tasks.find((item) => item.id === id);
        if (draft !== undefined) {
          updater(draft);
        }
      },
    },
    offline: {
      createOfflineTransaction: () => ({
        mutate: (apply: () => void) => {
          apply();
        },
        commit: () => Promise.resolve(),
      }),
    },
  } as unknown as BoardClient;
}

function taskStructure(tasks: ReadonlyArray<Task>) {
  return tasks
    .map((item) => ({
      id: item.id,
      laneId: item.laneId,
      parentId: item.parentId,
      rank: item.rank,
    }))
    .toSorted(
      (left, right) =>
        (left.laneId ?? "").localeCompare(right.laneId ?? "") || left.rank - right.rank,
    );
}

function expectTaskStructure(client: BoardClient, expected: ReadonlyArray<TaskFixture>) {
  expect(taskStructure(client.tasks.toArray)).toEqual(taskStructure(materializeTasks(expected)));
}

function completionState(client: BoardClient) {
  return Object.fromEntries(client.tasks.toArray.map((item) => [item.id, item.completed]));
}

describe("task completion", () => {
  it("only completes task IDs explicitly selected by the completion operation", () => {
    const client = testClient([task("parent", [task("detached")])]);

    completeTasks(client.tasks, ["parent"]);

    expect(completionState(client)).toEqual({ parent: true, detached: false });
  });

  it("does not complete a former child after it moves to another lane", () => {
    const client = testClient([task("parent", [task("detached")])]);

    Effect.runSync(moveTaskToLane(client, "detached", "right", "lane"));
    completeTask(client, "parent");

    expect(completionState(client)).toEqual({ parent: true, detached: false });
  });

  it("does not complete a former child after it is unnested", () => {
    const client = testClient([task("parent", [task("detached")])]);

    Effect.runSync(nestTask(client, "detached", -1, "lane"));
    completeTask(client, "parent");

    expect(completionState(client)).toEqual({ parent: true, detached: false });
  });

  it("completes a child that remains nested", () => {
    const client = testClient([task("parent", [task("child")])]);

    completeTask(client, "parent");

    expect(completionState(client)).toEqual({ parent: true, child: true });
  });
});

describe("task collapse", () => {
  it("persists a requested collapse state and is idempotent", async () => {
    const client = testClient([task("parent", [task("child")])]);

    await expect(Effect.runPromise(setTaskCollapsed(client, "parent", true))).resolves.toBe(true);
    await expect(Effect.runPromise(setTaskCollapsed(client, "parent", true))).resolves.toBe(false);

    expect(client.tasks.get("parent")?.collapsed).toBe(true);
  });

  it("does not create an update for a missing task", async () => {
    const client = testClient([]);

    await expect(Effect.runPromise(setTaskCollapsed(client, "missing", true))).resolves.toBe(false);
  });
});

describe("moveTaskInLane", () => {
  it("moves a parent and all of its descendants down as one subtree", () => {
    const client = testClient([
      task("parent", [task("child", [task("grandchild")])]),
      task("sibling"),
    ]);

    Effect.runSync(moveTaskInLane(client, "parent", "down", "lane"));

    expectTaskStructure(client, [
      task("sibling"),
      task("parent", [task("child", [task("grandchild")])]),
    ]);
  });

  it("moves a parent and all of its descendants up as one subtree", () => {
    const client = testClient([
      task("sibling"),
      task("parent", [task("child", [task("grandchild")])]),
    ]);

    Effect.runSync(moveTaskInLane(client, "parent", "up", "lane"));

    expectTaskStructure(client, [
      task("parent", [task("child", [task("grandchild")])]),
      task("sibling"),
    ]);
  });

  it.each([
    {
      direction: "down" as const,
      tasks: [
        task("root", [task("selected", [task("descendant")]), task("sibling")]),
        task("outside"),
      ],
      expected: [
        task("root", [task("sibling"), task("selected", [task("descendant")])]),
        task("outside"),
      ],
    },
    {
      direction: "up" as const,
      tasks: [
        task("root", [task("sibling"), task("selected", [task("descendant")])]),
        task("outside"),
      ],
      expected: [
        task("root", [task("selected", [task("descendant")]), task("sibling")]),
        task("outside"),
      ],
    },
  ])(
    "moves a deep subtree $direction only within its sibling group",
    ({ direction, tasks, expected }) => {
      const client = testClient(tasks);

      Effect.runSync(moveTaskInLane(client, "selected", direction, "lane"));

      expectTaskStructure(client, expected);
    },
  );

  it.each([
    { taskId: "first", direction: "up" as const },
    { taskId: "last", direction: "down" as const },
  ])("does not move the $taskId task beyond its sibling group", ({ taskId, direction }) => {
    const tasks = [
      task("outside-before"),
      task("root", [task("first"), task("last")]),
      task("outside-after"),
    ];
    const client = testClient(tasks);

    Effect.runSync(moveTaskInLane(client, taskId, direction, "lane"));

    expectTaskStructure(client, tasks);
  });
});

describe("moveTaskToLane", () => {
  it.each([
    { direction: "left" as const, destination: "lane-left" },
    { direction: "right" as const, destination: "lane-right" },
  ])("moves a selected subtree $direction to the adjacent lane", ({ direction, destination }) => {
    const client = testClient([
      task(`existing-${direction}`, [], { laneId: destination }),
      task("ancestor", [task("selected", [task("child", [task("grandchild")])])]),
    ]);

    expect(Effect.runSync(moveTaskToLane(client, "selected", direction, "lane"))?.viewId).toBe(
      destination,
    );

    expectTaskStructure(client, [
      task(`existing-${direction}`, [], { laneId: destination }),
      task("ancestor"),
      task("selected", [task("child", [task("grandchild")])], { laneId: destination }),
    ]);
  });
});

describe("explicit board moves", () => {
  const source = { kind: "task", taskId: "moving", viewId: "lane" };

  it("inserts a collapsed subtree after the complete target subtree in one transaction", () => {
    const client = testClient([
      task("moving", [task("hidden")]),
      task("middle"),
      task("target", [task("child")]),
    ]);
    client.tasks.update("moving", (draft) => {
      draft.collapsed = true;
    });
    const transaction = vi.spyOn(client.offline, "createOfflineTransaction");
    Effect.runSync(
      dropBoardEntity(client, source, {
        kind: "task",
        taskId: "target",
        viewId: "lane",
        edge: "after",
      }),
    );
    expectTaskStructure(client, [
      task("middle"),
      task("target", [task("child")]),
      task("moving", [task("hidden")]),
    ]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(client.tasks.get("moving")?.collapsed).toBe(true);
  });

  it("nests as the last child, inherits placement and expands the parent atomically", () => {
    const client = testClient([
      task("moving", [task("hidden")]),
      task("parent", [task("child")], { laneId: "lane-right" }),
    ]);
    client.tasks.update("parent", (draft) => {
      draft.collapsed = true;
      draft.date = "Tomorrow";
    });
    const transaction = vi.spyOn(client.offline, "createOfflineTransaction");
    Effect.runSync(
      dropBoardEntity(client, source, {
        kind: "task",
        taskId: "parent",
        viewId: "lane-right",
        edge: "nest",
      }),
    );
    expect(client.tasks.get("moving")).toMatchObject({
      parentId: "parent",
      laneId: "lane-right",
      date: "Tomorrow",
      rank: 2,
    });
    expect(client.tasks.get("hidden")).toMatchObject({
      parentId: "moving",
      laneId: "lane-right",
      date: "Tomorrow",
      rank: 3,
    });
    expect(client.tasks.get("parent")?.collapsed).toBe(false);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("adopts a target's parent on an edge drop and unnests on whitespace", () => {
    const client = testClient([task("parent", [task("target")]), task("moving", [task("child")])]);
    Effect.runSync(
      dropBoardEntity(client, source, {
        kind: "task",
        taskId: "target",
        viewId: "lane",
        edge: "before",
      }),
    );
    expectTaskStructure(client, [
      task("parent", [task("moving", [task("child")]), task("target")]),
    ]);
    Effect.runSync(
      dropBoardEntity(client, source, { kind: "view", viewId: "lane", edge: "append" }),
    );
    expectTaskStructure(client, [
      task("parent", [task("target")]),
      task("moving", [task("child")]),
    ]);
  });

  it.each(["today", "inbox"])("applies %s placement to the entire subtree", (viewId) => {
    const client = testClient([task("moving", [task("child")])]);
    client.tasks.update("moving", (draft) => {
      draft.date = "Tomorrow";
    });
    Effect.runSync(dropBoardEntity(client, source, { kind: "view", viewId, edge: "append" }));
    for (const item of client.tasks.toArray) {
      expect(item.laneId).toBeUndefined();
      expect(item.date).toBe(viewId === "today" ? "Today" : undefined);
    }
  });

  it("preserves project assignment when reordering within the Today projection", () => {
    const client = testClient([task("moving"), task("target")]);
    for (const item of client.tasks.toArray)
      client.tasks.update(item.id, (draft) => {
        draft.date = "Today";
      });
    Effect.runSync(
      dropBoardEntity(
        client,
        { ...source, viewId: "today" },
        { kind: "task", taskId: "target", viewId: "today", edge: "after" },
      ),
    );
    expect(client.tasks.get("moving")).toMatchObject({ laneId: "lane", date: "Today", rank: 1 });
    expect(client.tasks.get("target")?.rank).toBe(0);
  });

  it("preserves the date on a project drop", () => {
    const client = testClient([task("moving")]);
    client.tasks.update("moving", (draft) => {
      draft.date = "Tomorrow";
    });
    Effect.runSync(
      dropBoardEntity(client, source, { kind: "view", viewId: "lane-right", edge: "append" }),
    );
    expect(client.tasks.get("moving")).toMatchObject({ laneId: "lane-right", date: "Tomorrow" });
  });

  it.each(["moving", "child", "missing"])(
    "rejects invalid target %s without a transaction",
    (taskId) => {
      const client = testClient([task("moving", [task("child")])]);
      const transaction = vi.spyOn(client.offline, "createOfflineTransaction");
      Effect.runSync(
        dropBoardEntity(client, source, { kind: "task", taskId, viewId: "lane", edge: "nest" }),
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it("validates stale source views and completed targets at drop time", () => {
    const client = testClient([task("moving"), task("target")]);
    const transaction = vi.spyOn(client.offline, "createOfflineTransaction");
    const target = { kind: "task", taskId: "target", viewId: "lane", edge: "nest" };
    Effect.runSync(dropBoardEntity(client, { ...source, viewId: "today" }, target));
    client.tasks.update("target", (draft) => {
      draft.completed = true;
    });
    Effect.runSync(dropBoardEntity(client, source, target));
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not transact for unchanged ordering or fixed system lanes", () => {
    const client = testClient([task("moving"), task("target")]);
    const transaction = vi.spyOn(client.offline, "createOfflineTransaction");
    Effect.runSync(
      dropBoardEntity(client, source, {
        kind: "task",
        taskId: "target",
        viewId: "lane",
        edge: "before",
      }),
    );
    Effect.runSync(moveLane(client, "today", { laneId: "lane", edge: "after" }));
    Effect.runSync(moveLane(client, "lane", { laneId: "inbox", edge: "before" }));
    expect(transaction).not.toHaveBeenCalled();
  });

  it("moves a lane across several positions in a single transaction", () => {
    const client = testClient([]);
    const transaction = vi.spyOn(client.offline, "createOfflineTransaction");
    Effect.runSync(
      dropBoardEntity(
        client,
        { kind: "lane", viewId: "lane-left" },
        { kind: "lane", viewId: "lane-right", edge: "after" },
      ),
    );
    expect(client.lanes.toArray.toSorted((a, b) => a.rank - b.rank).map((item) => item.id)).toEqual(
      ["lane", "lane-right", "lane-left"],
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("normalizes duplicate ranks deterministically when moving", () => {
    const client = testClient([task("moving"), task("target"), task("last")]);
    for (const item of client.tasks.toArray)
      client.tasks.update(item.id, (draft) => {
        draft.rank = 0;
      });
    Effect.runSync(
      dropBoardEntity(client, source, {
        kind: "task",
        taskId: "target",
        viewId: "lane",
        edge: "after",
      }),
    );
    expect(client.tasks.get("moving")?.rank).toBeGreaterThan(
      client.tasks.get("target")?.rank ?? Infinity,
    );
    expect(new Set(client.tasks.toArray.map((item) => item.rank)).size).toBe(3);
  });

  it("produces equivalent mutations for keyboard and pointer moves", () => {
    const fixture = [task("moving", [task("child")]), task("target")];
    const keyboard = testClient(fixture);
    const pointer = testClient(fixture);
    Effect.runSync(moveTaskInLane(keyboard, "moving", "down", "lane"));
    Effect.runSync(
      dropBoardEntity(pointer, source, {
        kind: "task",
        taskId: "target",
        viewId: "lane",
        edge: "after",
      }),
    );
    expect(taskStructure(pointer.tasks.toArray)).toEqual(taskStructure(keyboard.tasks.toArray));
    Effect.runSync(moveTaskToLane(keyboard, "moving", "right", "lane"));
    Effect.runSync(
      dropBoardEntity(pointer, source, { kind: "view", viewId: "lane-right", edge: "append" }),
    );
    expect(taskStructure(pointer.tasks.toArray)).toEqual(taskStructure(keyboard.tasks.toArray));
  });

  it("returns the optimistic result while disconnected and surfaces terminal commit failure through Effect", async () => {
    const client = testClient([task("moving"), task("target")]);
    let rejectCommit: ((reason: Error) => void) | undefined;
    const commit = new Promise<never>((_resolve, reject) => {
      rejectCommit = reject;
    });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    vi.spyOn(client.offline, "createOfflineTransaction").mockReturnValue({
      mutate: (apply: () => void) => {
        apply();
      },
      commit: () => commit,
    } as unknown as ReturnType<BoardClient["offline"]["createOfflineTransaction"]>);
    const result = Effect.runSync(
      dropBoardEntity(client, source, {
        kind: "task",
        taskId: "target",
        viewId: "lane",
        edge: "after",
      }),
    );
    expect(result?.viewId).toBe("lane");
    expect(client.tasks.get("moving")?.rank).toBe(1);
    if (result === undefined) throw new Error("Missing optimistic result");
    const completed = Effect.runPromise(result.completion.pipe(Effect.flip));
    rejectCommit?.(new Error("Terminal persistence failure"));
    await expect(completed).resolves.toMatchObject({ _tag: "BoardMoveError" });
  });
});
