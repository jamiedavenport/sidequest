import { describe, expect, it } from "vitest";

import { moveTaskInLane, moveTaskToLane } from "~/board/data/mutations";
import type { BoardClient } from "~/board/sync/client";
import type { Task } from "~/board/types";

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
    },
    tasks: {
      get toArray() {
        return tasks;
      },
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

describe("moveTaskInLane", () => {
  it("moves a parent and all of its descendants down as one subtree", () => {
    const client = testClient([
      task("parent", [task("child", [task("grandchild")])]),
      task("sibling"),
    ]);

    moveTaskInLane(client, "parent", "down", "lane");

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

    moveTaskInLane(client, "parent", "up", "lane");

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

      moveTaskInLane(client, "selected", direction, "lane");

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

    moveTaskInLane(client, taskId, direction, "lane");

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

    expect(moveTaskToLane(client, "selected", direction, "lane")).toBe(destination);

    expectTaskStructure(client, [
      task(`existing-${direction}`, [], { laneId: destination }),
      task("ancestor"),
      task("selected", [task("child", [task("grandchild")])], { laneId: destination }),
    ]);
  });
});
