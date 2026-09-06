import { describe, expect, it } from "vitest";
import { BoardEvent, currentLaneId } from "./model";
import { createBoardStore } from "./store";

describe("board store", () => {
  it("publishes immediate stable snapshots and preserves the server snapshot", () => {
    const store = createBoardStore();
    const initial = store.getSnapshot();
    expect(store.getSnapshot()).toBe(initial);
    store.send(BoardEvent.AddStart({ viewId: "project" }));
    const next = store.getSnapshot();
    expect(next.interaction._tag).toBe("Adding");
    expect(store.getSnapshot()).toBe(next);
    expect(store.getServerSnapshot()).toBe(initial);
    store.send(BoardEvent.Navigate({ direction: "left" }));
    expect(store.getSnapshot()).toBe(next);
  });

  it("queues reentrant dispatch until all subscribers see the current publication", () => {
    const store = createBoardStore();
    const seen: string[] = [];
    const observe = (name: string) => {
      seen.push(`${name}:${currentLaneId(store.getSnapshot())}`);
      if (currentLaneId(store.getSnapshot()) === "first") {
        store.send(BoardEvent.LaneSelect({ viewId: name }));
        expect(currentLaneId(store.getSnapshot())).toBe("first");
      }
    };
    store.subscribe(() => observe("a"));
    store.subscribe(() => observe("b"));
    store.send(BoardEvent.LaneSelect({ viewId: "first" }));
    expect(seen).toEqual(["b:first", "a:first", "b:b", "a:b", "b:a", "a:a"]);
    expect(currentLaneId(store.getSnapshot())).toBe("a");
  });

  it("isolates stores and removes subscriptions", () => {
    const first = createBoardStore();
    const second = createBoardStore();
    const seen: string[] = [];
    const unsubscribe = first.subscribe(() => seen.push(currentLaneId(first.getSnapshot())));
    first.send(BoardEvent.LaneSelect({ viewId: "project" }));
    expect(currentLaneId(second.getSnapshot())).toBe("today");
    unsubscribe();
    first.send(BoardEvent.LaneSelect({ viewId: "inbox" }));
    expect(seen).toEqual(["project"]);
  });
});
