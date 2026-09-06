import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";

import { createBoardStore } from "./store";
import { buildBoardGraph } from "./graph";
import {
  BoardEvent,
  Interaction,
  Selection,
  currentLaneId,
  selectedTaskId,
  type BoardContext,
} from "./model";
import { syncBoard } from "~/board/navigation/commands";
import type { BoardLane } from "~/board/types";

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

describe("board transitions", () => {
  it("stays in the add form after creating a task", () => {
    const store = createBoardStore();

    store.send(BoardEvent.AddStart({ viewId: "lane" }));
    store.send(BoardEvent.TaskCreated({ target: { viewId: "lane", taskId: "created-task" } }));

    expect(store.getSnapshot().interaction._tag).toBe("Adding");
    expect(cursor(store.getSnapshot())).toEqual({
      laneId: "lane",
      taskId: "created-task",
    });
  });
});

describe("syncBoard", () => {
  it("selects the nearest visible ancestor when collapse hides the selected task", () => {
    const root = boardTask("root");
    const parent = { ...boardTask("parent", "root"), visualDepth: 1 };
    const child = { ...boardTask("child", "parent"), visualDepth: 2 };
    const context: BoardContext = {
      graph: buildBoardGraph([lane([root, parent, child])], [root, parent, child]),
      interaction: Interaction.Navigating({
        selection: Selection.Task({ target: { viewId: "lane", taskId: "child" } }),
      }),
    };
    const next = Effect.runSync(syncBoard(context, sync([lane([{ ...root, collapsed: true }])])));
    expect(cursor(next)).toEqual({ laneId: "lane", taskId: "root" });
  });
});

describe("board dragging", () => {
  function draggingStore() {
    const store = createBoardStore();
    store.send(
      sync([{ ...lane([]), id: "today" }, lane([boardTask("first"), boardTask("second")])]),
    );
    store.send(
      BoardEvent.DragStart({
        source: Selection.Task({ target: { viewId: "lane", taskId: "first" } }),
      }),
    );
    return store;
  }

  it("suppresses navigation and editing while processing board synchronization", () => {
    const store = draggingStore();
    store.send(BoardEvent.Navigate({ direction: "down" }));
    store.send(BoardEvent.TaskSelect({ target: { viewId: "lane", taskId: "second" } }));
    store.send(BoardEvent.AddStart({ viewId: "lane" }));
    store.send(BoardEvent.EditStart({ target: { viewId: "lane", taskId: "second" } }));
    store.send(
      BoardEvent.DetailsOpen({ tab: "notes", target: { viewId: "lane", taskId: "second" } }),
    );
    store.send(sync([lane([boardTask("first"), boardTask("new")])]));
    expect(store.getSnapshot().interaction._tag).toBe("Dragging");
    expect(selectedTaskId(store.getSnapshot())).toBe("first");
    expect(
      Option.getOrUndefined(store.getSnapshot().graph.lane("lane"))?.lastVisible?.task.id,
    ).toBe("new");
  });

  it("finishes in the destination view and clears the drag", () => {
    const store = draggingStore();
    store.send(BoardEvent.DragFinish({ viewId: "today" }));
    expect(store.getSnapshot().interaction._tag).toBe("Navigating");
    expect(cursor(store.getSnapshot())).toEqual({ laneId: "today", taskId: "first" });
  });

  it("cancels without moving selection", () => {
    const store = draggingStore();
    store.send(BoardEvent.DragCancel({}));
    expect(store.getSnapshot().interaction._tag).toBe("Navigating");
    expect(selectedTaskId(store.getSnapshot())).toBe("first");
  });

  it("cancels if synchronization removes the dragged entity", () => {
    const store = draggingStore();
    store.send(sync([lane([boardTask("second")])]));
    expect(store.getSnapshot().interaction._tag).toBe("Navigating");
    expect(selectedTaskId(store.getSnapshot())).toBe("second");
  });

  it.each(["Editing", "Adding", "Details"] as const)("cannot start from %s", (mode) => {
    const store = createBoardStore();
    store.send(sync([lane([boardTask("first")])]));
    if (mode === "Editing")
      store.send(BoardEvent.EditStart({ target: { viewId: "lane", taskId: "first" } }));
    if (mode === "Adding") store.send(BoardEvent.AddStart({ viewId: "lane" }));
    if (mode === "Details")
      store.send(
        BoardEvent.DetailsOpen({ tab: "notes", target: { viewId: "lane", taskId: "first" } }),
      );
    store.send(
      BoardEvent.DragStart({
        source: Selection.Task({ target: { viewId: "lane", taskId: "first" } }),
      }),
    );
    expect(store.getSnapshot().interaction._tag).toBe(mode);
  });

  it("keeps system lanes fixed", () => {
    const store = createBoardStore();
    store.send(BoardEvent.DragStart({ source: Selection.Lane({ viewId: "today" }) }));
    expect(store.getSnapshot().interaction._tag).toBe("Navigating");
  });
});

describe("navigation behavior", () => {
  it("handles boundaries, empty lanes, and leaving adding upwards", () => {
    const store = createBoardStore();
    store.send(sync([lane([boardTask("a"), boardTask("b")]), { ...lane([]), id: "empty" }]));
    store.send(BoardEvent.Navigate({ direction: "up" }));
    expect(selectedTaskId(store.getSnapshot())).toBe("a");
    store.send(BoardEvent.Navigate({ direction: "down" }));
    expect(selectedTaskId(store.getSnapshot())).toBe("b");
    store.send(BoardEvent.Navigate({ direction: "down" }));
    expect(store.getSnapshot().interaction._tag).toBe("Adding");
    store.send(BoardEvent.Navigate({ direction: "right" }));
    expect(currentLaneId(store.getSnapshot())).toBe("lane");
    store.send(BoardEvent.Navigate({ direction: "up" }));
    expect(store.getSnapshot().interaction._tag).toBe("Navigating");
    expect(selectedTaskId(store.getSnapshot())).toBe("b");
    store.send(BoardEvent.Navigate({ direction: "right" }));
    expect(cursor(store.getSnapshot())).toEqual({ laneId: "empty", taskId: null });
    store.send(BoardEvent.Navigate({ direction: "down" }));
    expect(store.getSnapshot().interaction._tag).toBe("Adding");
  });

  it.each(["Editing", "Details"] as const)(
    "closes %s when its occurrence disappears, even if another survives",
    (mode) => {
      const store = createBoardStore();
      store.send(sync([lane([boardTask("a")]), { ...lane([boardTask("a")]), id: "other" }]));
      if (mode === "Editing")
        store.send(BoardEvent.EditStart({ target: { viewId: "lane", taskId: "a" } }));
      else
        store.send(
          BoardEvent.DetailsOpen({ tab: "notes", target: { viewId: "lane", taskId: "a" } }),
        );
      store.send(BoardEvent.Navigate({ direction: "right" }));
      expect(store.getSnapshot().interaction._tag).toBe(mode);
      store.send(sync([lane([]), { ...lane([boardTask("a")]), id: "other" }]));
      expect(store.getSnapshot().interaction._tag).toBe("Navigating");
      expect(cursor(store.getSnapshot())).toEqual({ laneId: "other", taskId: "a" });
    },
  );

  it("prefers the immediate right neighbor of a removed lane", () => {
    const store = createBoardStore();
    const lanes = ["left", "lane", "right"].map((id) => ({ ...lane([]), id }));
    store.send(sync(lanes));
    store.send(BoardEvent.AddStart({ viewId: "lane" }));
    store.send(sync([lanes[0]!, lanes[2]!]));
    expect(store.getSnapshot().interaction._tag).toBe("Navigating");
    expect(currentLaneId(store.getSnapshot())).toBe("right");
  });
});

function cursor(context: BoardContext) {
  return { laneId: currentLaneId(context), taskId: selectedTaskId(context) };
}

function sync(lanes: readonly BoardLane[]) {
  return BoardEvent.BoardSync({ lanes, tasks: lanes.flatMap((view) => view.tasks) });
}

describe("mode event table", () => {
  const target = { viewId: "lane", taskId: "a" };
  const other = { viewId: "lane", taskId: "b" };
  const selection = Selection.Task({ target });
  const modes = {
    Navigating: Interaction.Navigating({ selection }),
    Adding: Interaction.Adding({ selection }),
    Editing: Interaction.Editing({ target }),
    Details: Interaction.Details({ target, tab: "notes" }),
    Dragging: Interaction.Dragging({ selection, source: selection }),
  };
  const events = [
    sync([lane([boardTask("a"), boardTask("b")])]),
    BoardEvent.Navigate({ direction: "down" }),
    BoardEvent.LaneSelect({ viewId: "other" }),
    BoardEvent.TaskSelect({ target: other }),
    BoardEvent.TaskCreated({ target: other }),
    BoardEvent.EditStart({ target: other }),
    BoardEvent.EditCancel({}),
    BoardEvent.EditSave({}),
    BoardEvent.DetailsOpen({ target: other, tab: "whiteboard" }),
    BoardEvent.DetailsTabSelect({ tab: "whiteboard" }),
    BoardEvent.DetailsClose({}),
    BoardEvent.AddStart({ viewId: "other" }),
    BoardEvent.AddCancel({}),
    BoardEvent.DragStart({ source: Selection.Task({ target: other }) }),
    BoardEvent.DragFinish({ viewId: "other" }),
    BoardEvent.DragCancel({}),
  ];
  // Expected results are explicit behavioral fixtures, independent of the implementation table.
  const accepted: Record<
    Interaction["_tag"],
    Partial<Record<BoardEvent["_tag"], Interaction["_tag"]>>
  > = {
    Navigating: {
      BoardSync: "Navigating",
      Navigate: "Navigating",
      LaneSelect: "Navigating",
      TaskSelect: "Navigating",
      EditStart: "Editing",
      DetailsOpen: "Details",
      AddStart: "Adding",
      DragStart: "Dragging",
    },
    Adding: {
      BoardSync: "Adding",
      LaneSelect: "Navigating",
      TaskSelect: "Navigating",
      TaskCreated: "Adding",
      EditStart: "Editing",
      AddStart: "Adding",
      AddCancel: "Navigating",
    },
    Editing: {
      BoardSync: "Editing",
      LaneSelect: "Navigating",
      TaskSelect: "Navigating",
      EditStart: "Editing",
      EditCancel: "Navigating",
      EditSave: "Navigating",
      AddStart: "Adding",
    },
    Details: {
      BoardSync: "Details",
      DetailsOpen: "Details",
      DetailsTabSelect: "Details",
      DetailsClose: "Navigating",
    },
    Dragging: { BoardSync: "Dragging", DragFinish: "Navigating", DragCancel: "Navigating" },
  };
  for (const interaction of Object.values(modes)) {
    it.each(events)(`${interaction._tag} handles $_tag`, (event) => {
      const initial = {
        graph: buildBoardGraph(
          [lane([boardTask("a"), boardTask("b")])],
          [boardTask("a"), boardTask("b")],
        ),
        interaction,
      };
      const store = createBoardStore(initial);
      store.send(event);
      const expected = accepted[interaction._tag][event._tag];
      if (expected === undefined) expect(store.getSnapshot()).toBe(initial);
      else {
        expect(store.getSnapshot()).not.toBe(initial);
        expect(store.getSnapshot().interaction._tag).toBe(expected);
      }
    });
  }
});

describe("synchronization and intent", () => {
  it("retains repeated newly created targets until synchronization and stays adding", () => {
    const store = createBoardStore();
    store.send(sync([lane([])]));
    store.send(BoardEvent.AddStart({ viewId: "lane" }));
    for (const id of ["a", "b"]) {
      store.send(BoardEvent.TaskCreated({ target: { viewId: "lane", taskId: id } }));
      expect(selectedTaskId(store.getSnapshot())).toBe(id);
      expect(store.getSnapshot().interaction._tag).toBe("Adding");
      store.send(sync([lane([boardTask("a"), ...(id === "b" ? [boardTask("b")] : [])])]));
      expect(selectedTaskId(store.getSnapshot())).toBe(id);
      expect(store.getSnapshot().interaction._tag).toBe("Adding");
    }
  });

  it("records editing and details intent before a target exists", () => {
    const target = { viewId: "future", taskId: "future-task" };
    const store = createBoardStore();
    store.send(BoardEvent.EditStart({ target }));
    expect(store.getSnapshot().interaction).toEqual(Interaction.Editing({ target }));
    store.send(BoardEvent.EditSave({}));
    store.send(BoardEvent.DetailsOpen({ target, tab: "whiteboard" }));
    expect(store.getSnapshot().interaction).toEqual(
      Interaction.Details({ target, tab: "whiteboard" }),
    );
    store.send(sync([{ ...lane([boardTask("future-task")]), id: "future" }]));
    expect(store.getSnapshot().interaction).toEqual(
      Interaction.Details({ target, tab: "whiteboard" }),
    );
  });

  it("traverses a hidden canonical ancestor to the nearest visible one", () => {
    const first = boardTask("first");
    const root = { ...boardTask("root"), laneId: "lane" };
    const parent = { ...boardTask("parent", "root"), laneId: "lane" };
    const child = { ...boardTask("child", "parent"), laneId: "lane" };
    const store = createBoardStore();
    store.send(
      BoardEvent.BoardSync({
        lanes: [lane([first, root, child])],
        tasks: [first, root, parent, child],
      }),
    );
    store.send(BoardEvent.TaskSelect({ target: { viewId: "lane", taskId: "child" } }));
    store.send(
      BoardEvent.BoardSync({ lanes: [lane([first, root])], tasks: [first, root, parent, child] }),
    );
    expect(selectedTaskId(store.getSnapshot())).toBe("root");
  });

  it.each(["left", "first"])(
    "falls back to %s when a removed view's right neighbor is unavailable",
    (fallback) => {
      const store = createBoardStore();
      const lanes = ["first", "left", "selected", "right"].map((id) => ({ ...lane([]), id }));
      store.send(sync(lanes));
      store.send(BoardEvent.LaneSelect({ viewId: "selected" }));
      store.send(sync(lanes.filter((view) => view.id === "first" || view.id === fallback)));
      expect(currentLaneId(store.getSnapshot())).toBe(fallback);
    },
  );

  it("preserves Today on initialization and handles a completely empty board", () => {
    const store = createBoardStore();
    expect(cursor(store.getSnapshot())).toEqual({ laneId: "today", taskId: null });
    store.send(sync([]));
    store.send(BoardEvent.Navigate({ direction: "right" }));
    expect(cursor(store.getSnapshot())).toEqual({ laneId: "today", taskId: null });
  });

  it("selects a lane's first task on sync, preserves lane reselection, and respects outer horizontal boundaries", () => {
    const store = createBoardStore();
    store.send(sync([lane([boardTask("a"), boardTask("b")])]));
    store.send(BoardEvent.Navigate({ direction: "left" }));
    expect(selectedTaskId(store.getSnapshot())).toBe("a");
    store.send(BoardEvent.Navigate({ direction: "down" }));
    store.send(BoardEvent.LaneSelect({ viewId: "lane" }));
    store.send(BoardEvent.Navigate({ direction: "right" }));
    expect(selectedTaskId(store.getSnapshot())).toBe("b");
  });

  it("completes lane dragging and rejects missing sources and both system lanes", () => {
    const store = createBoardStore();
    store.send(sync([lane([boardTask("a")]), { ...lane([]), id: "other" }]));
    store.send(BoardEvent.DragStart({ source: Selection.Lane({ viewId: "lane" }) }));
    store.send(BoardEvent.DragFinish({ viewId: "other" }));
    expect(cursor(store.getSnapshot())).toEqual({ laneId: "other", taskId: null });
    for (const viewId of ["today", "inbox", "missing"]) {
      store.send(BoardEvent.DragStart({ source: Selection.Lane({ viewId }) }));
      expect(store.getSnapshot().interaction._tag).toBe("Navigating");
    }
    store.send(
      BoardEvent.DragStart({
        source: Selection.Task({ target: { viewId: "lane", taskId: "missing" } }),
      }),
    );
    expect(store.getSnapshot().interaction._tag).toBe("Navigating");
  });
});
