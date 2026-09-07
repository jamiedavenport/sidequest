import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { BoardContext } from "./model";
import { createBoardStore, type BoardStore } from "./store";

const BoardStoreContext = createContext<BoardStore | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) @{
  const [store] = useState(createBoardStore);
  <BoardStoreContext value={store}>{children}</BoardStoreContext>;
}

export function useBoardStore(): BoardStore {
  const store = useContext(BoardStoreContext);
  if (store === null) {
    throw new Error("Board provider is missing");
  }
  return store;
}

export function useBoardSelector<A>(select: (context: BoardContext) => A): A {
  const store = useBoardStore();
  const snapshots = useMemo(() => {
    let previous: BoardContext | undefined;
    let selected: A;
    const read = (context: BoardContext): A => {
      if (context !== previous) {
        selected = select(context);
        previous = context;
      }
      return selected;
    };
    return { get: () => read(store.getSnapshot()), server: () => read(store.getServerSnapshot()) };
  }, [store, select]);
  return useSyncExternalStore(store.subscribe, snapshots.get, snapshots.server);
}
