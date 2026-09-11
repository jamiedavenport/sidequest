import { Effect } from "effect";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isLanePrivate, setLanePrivacy } from "~/board/data/privacy";
import { useBoardClient } from "~/board/sync/client.tsrx";
import { useBoardSelector, useBoardStore } from "~/board/navigation/provider.tsrx";
import { BoardEvent, currentLaneId } from "~/board/navigation/model";
import { useLaneChrome } from "../lane-chrome.tsrx";

type LanePrivacyContextValue = {
  hiddenLaneIds: readonly string[];
  canToggle: boolean;
  toggleLanePrivacy: (laneId: string) => void;
};

const LanePrivacyContext = createContext<LanePrivacyContextValue | null>(null);

export function useLanePrivacy() {
  const context = useContext(LanePrivacyContext);
  if (context === null) {
    throw new Error("Lane privacy provider is missing");
  }
  return context;
}

function usePrivateLaneChrome(hiddenLaneIds: readonly string[]) {
  const {
    editingLaneId,
    removingLaneId,
    githubLaneId,
    stopRename,
    stopRemove,
    closeGithubSettings,
  } = useLaneChrome();
  useLayoutEffect(() => {
    if (editingLaneId !== null && hiddenLaneIds.includes(editingLaneId)) {
      stopRename();
    }
    if (removingLaneId !== null && hiddenLaneIds.includes(removingLaneId)) {
      stopRemove();
    }
    if (githubLaneId !== null && hiddenLaneIds.includes(githubLaneId)) {
      closeGithubSettings();
    }
  }, [
    hiddenLaneIds,
    editingLaneId,
    removingLaneId,
    githubLaneId,
    stopRename,
    stopRemove,
    closeGithubSettings,
  ]);
  return editingLaneId === null && removingLaneId === null && githubLaneId === null;
}

export function LanePrivacyProvider({
  children,
  hiddenLaneIds,
}: {
  children: ReactNode;
  hiddenLaneIds: readonly string[];
}) @{
  const client = useBoardClient();
  const store = useBoardStore();
  const mode = useBoardSelector((snapshot) => snapshot.interaction._tag);
  const chromeAvailable = usePrivateLaneChrome(hiddenLaneIds);
  const [failure, setFailure] = useState(false);
  const previousHiddenIds = useRef(hiddenLaneIds);
  useEffect(() => {
    const laneId = currentLaneId(store.getSnapshot());
    if (hiddenLaneIds.includes(laneId) && !previousHiddenIds.current.includes(laneId)) {
      document.querySelector<HTMLElement>("[data-board-focus]")?.focus({ preventScroll: true });
    }
    previousHiddenIds.current = hiddenLaneIds;
  }, [hiddenLaneIds, store]);
  const canToggle = mode === "Navigating" && chromeAvailable;

  const value = useMemo(
    () => ({
      hiddenLaneIds,
      canToggle,
      toggleLanePrivacy: (laneId: string) => {
        if (
          !canToggle ||
          document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null
        ) {
          return;
        }
        setFailure(false);
        store.send(BoardEvent.LaneSelect({ viewId: laneId }));
        void Effect.runPromise(
          setLanePrivacy(client, laneId, !isLanePrivate(client, laneId)).pipe(
            Effect.catch(() =>
              Effect.sync(() => {
                setFailure(true);
              }),
            ),
          ),
        );
        document.querySelector<HTMLElement>("[data-board-focus]")?.focus({ preventScroll: true });
      },
    }),
    [hiddenLaneIds, canToggle, store, client],
  );

  <LanePrivacyContext value={value}>
    {children}
    @if (failure) {
      <div
        role="alert"
        className="fixed inset-x-3 bottom-12 z-50 rounded-lg border border-destructive/30 bg-background p-3 text-sm text-destructive"
      >
        Could not save lane privacy. Please try again.
      </div>;
    }
  </LanePrivacyContext>;
}
