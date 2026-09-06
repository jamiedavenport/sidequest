import { createElement, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  BoardProvider,
  useBoardSelector,
  useBoardStore,
} from "../../src/board/navigation/provider.tsrx";
import { BoardEvent, currentLaneId } from "../../src/board/navigation/model";
import type { BoardStore } from "../../src/board/navigation/store";

type ProbeState = { store?: BoardStore; subscriptions: number; renders: number };

function Probe({ probe }: { probe: ProbeState }) @{
  const store = useBoardStore();
  useState(() => {
    probe.store = store;
    const subscribe = store.subscribe;
    store.subscribe = (listener) => {
      probe.subscriptions += 1;
      const unsubscribe = subscribe(listener);
      return () => {
        probe.subscriptions -= 1;
        unsubscribe();
      };
    };
    return null;
  });
  // An allocating selector exercises snapshot caching as well as React subscriptions.
  const selected = useBoardSelector((context) => ({ viewId: currentLaneId(context) }));
  probe.renders += 1;
  <output>{selected.viewId}</output>;
}

function Providers({ first, second }: { first: ProbeState; second: ProbeState }) @{
  <BoardProvider>
    <Probe probe={first} />
    <BoardProvider>
      <Probe probe={second} />
    </BoardProvider>
  </BoardProvider>;
}

export function checkProviders() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const first: ProbeState = { subscriptions: 0, renders: 0 };
  const second: ProbeState = { subscriptions: 0, renders: 0 };
  try {
    flushSync(() => root.render(createElement(Providers, { first, second })));
    const initial = host.textContent;
    flushSync(() => first.store?.send(BoardEvent.LaneSelect({ viewId: "project" })));
    const updated = host.textContent;
    const active = [first.subscriptions, second.subscriptions];
    flushSync(() => root.render(createElement(Providers, { first, second })));
    const rerendered = host.textContent;
    flushSync(() => root.unmount());
    const removed = [first.subscriptions, second.subscriptions];
    const renders = first.renders;
    first.store?.send(BoardEvent.LaneSelect({ viewId: "inbox" }));
    return {
      initial,
      updated,
      rerendered,
      active,
      removed,
      rendersAfterUnmount: first.renders - renders,
    };
  } finally {
    host.remove();
  }
}
