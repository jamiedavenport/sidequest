import { Option } from "effect";
import { describe, expect, it } from "vitest";
import type { BoardLane, BoardTask, Task } from "~/board/types";
import { buildBoardGraph } from "./graph";

const now = new Date(2026, 8, 6, 12);

function task(id: string, fields: Partial<Task> = {}): BoardTask {
  return {
    id,
    title: id,
    rank: 0,
    completed: false,
    collapsed: false,
    laneId: "project",
    visualDepth: 0,
    ...fields,
  };
}

function lane(id: string, tasks: readonly BoardTask[]): BoardLane {
  return { id, title: id, rank: 0, colour: "green", shape: "square", hidden: false, tasks };
}

describe("BoardGraph", () => {
  it("links visible order independently for each occurrence", () => {
    const shared = task("shared", { date: "2026-09-06" });
    const today = task("today-only", { laneId: undefined, date: "2026-09-06" });
    const project = task("project-only");
    const graph = buildBoardGraph(
      [lane("today", [today, shared]), lane("project", [shared, project])],
      [shared, today, project],
      now,
    );
    const inToday = Option.getOrThrow(graph.task({ viewId: "today", taskId: "shared" }));
    const inProject = Option.getOrThrow(graph.task({ viewId: "project", taskId: "shared" }));
    expect(inToday.previousVisible?.task.id).toBe("today-only");
    expect(inToday.nextVisible).toBeUndefined();
    expect(inProject.previousVisible).toBeUndefined();
    expect(inProject.nextVisible?.task.id).toBe("project-only");
    expect(graph.occurrences("shared")).toHaveLength(2);
    expect(Option.getOrThrow(graph.firstVisibleOccurrence("shared"))).toBe(inToday);
    expect(graph.task({ viewId: "missing", taskId: "shared" })).toEqual(Option.none());
    expect(graph.firstLane?.next?.previous).toBe(graph.firstLane);
  });

  it("retains hidden descendants and uses canonical parent IDs, not rendered depth", () => {
    const root = task("root", { collapsed: true });
    const parent = task("parent", { parentId: "root" });
    const child = task("child", { parentId: "parent", date: "2026-09-06" });
    const graph = buildBoardGraph(
      [lane("today", [child]), lane("project", [root])],
      [root, parent, child],
      now,
    );
    const hidden = Option.getOrThrow(graph.task({ viewId: "project", taskId: "child" }));
    expect(hidden.parent?.task.id).toBe("parent");
    expect(hidden.parent?.parent?.children[0]).toBe(hidden.parent);
    expect(hidden.parent?.children).toEqual([hidden]);
    expect(graph.visibleTask(hidden.target)).toEqual(Option.none());
    expect(hidden.previousVisible).toBeUndefined();
    expect(hidden.nextVisible).toBeUndefined();
    expect(
      Option.getOrThrow(graph.task({ viewId: "today", taskId: "child" })).parent,
    ).toBeUndefined();
  });

  it("handles missing parents, self cycles and multi-node cycles", () => {
    const tasks = [
      task("orphan", { parentId: "missing" }),
      task("self", { parentId: "self" }),
      task("a", { parentId: "b" }),
      task("b", { parentId: "c" }),
      task("c", { parentId: "a" }),
    ];
    const graph = buildBoardGraph([lane("project", tasks)], tasks, now);
    expect(
      Option.getOrThrow(graph.task({ viewId: "project", taskId: "orphan" })).parent,
    ).toBeUndefined();
    expect(
      Option.getOrThrow(graph.task({ viewId: "project", taskId: "self" })).parent,
    ).toBeUndefined();
    for (const item of tasks) {
      let node = Option.getOrUndefined(graph.task({ viewId: "project", taskId: item.id }));
      const seen = new Set();
      while (node) {
        expect(seen.has(node)).toBe(false);
        seen.add(node);
        node = node.parent;
      }
    }
  });

  it("keeps previous graphs and input snapshots immutable across rebuilds", () => {
    const first = task("first");
    const second = task("second", { parentId: "first" });
    const rows = [first, second];
    const lanes = [lane("project", rows)];
    const old = buildBoardGraph(lanes, rows, now);
    const node = Option.getOrThrow(old.task({ viewId: "project", taskId: "first" }));
    rows.reverse();
    Object.assign(lanes[0]!, { title: "Changed" });
    const next = buildBoardGraph([lane("project", [first])], [first], now);
    expect(node.nextVisible?.task.id).toBe("second");
    expect(node.children[0]?.task.id).toBe("second");
    expect(old.firstLane?.lane.title).toBe("project");
    expect(next.firstLane?.lastVisible?.task.id).toBe("first");
    expect(Object.isFrozen(node)).toBe(true);
    expect(Object.isFrozen(node.task)).toBe(true);
    expect(Object.isFrozen(node.target)).toBe(true);
    expect(Object.isFrozen(node.children)).toBe(true);
    expect(Object.isFrozen(old.occurrences("first"))).toBe(true);
  });

  it("constructs deep parent chains without recursion", () => {
    const tasks = Array.from({ length: 10000 }, (_, i) =>
      task(String(i), { parentId: i === 0 ? undefined : String(i - 1) }),
    );
    const graph = buildBoardGraph([lane("project", [])], tasks, now);
    let node = Option.getOrUndefined(graph.task({ viewId: "project", taskId: "9999" }));
    let depth = 0;
    while (node) {
      depth += 1;
      node = node.parent;
    }
    expect(depth).toBe(10000);
  });
});
