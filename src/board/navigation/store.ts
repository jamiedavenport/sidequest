import { Effect } from "effect";
import { AtomRef } from "effect/unstable/reactivity";
import { initialBoardContext } from "./commands";
import type { BoardContext, BoardEvent } from "./model";
import { transition } from "./transition";

export function createBoardStore(initial: BoardContext = initialBoardContext()) {
  const state = AtomRef.make(initial);
  const pending: BoardEvent[] = [];
  let publishing = false;
  return {
    getSnapshot: () => state.value,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => state.subscribe(listener),
    send(event: BoardEvent): void {
      pending.push(event);
      if (publishing) return;
      publishing = true;
      try {
        // A subscriber may dispatch; finish notifying everyone before processing it.
        for (let index = 0; index < pending.length; index += 1) {
          const next = pending[index];
          if (next) state.set(Effect.runSync(transition(state.value, next)));
        }
      } finally {
        pending.length = 0;
        publishing = false;
      }
    },
  };
}

export type BoardStore = ReturnType<typeof createBoardStore>;
