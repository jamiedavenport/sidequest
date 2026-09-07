import { Effect } from "effect";
import { fromGithubPromise } from "~/github/schema";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getGithubLaneConnections } from "~/github/functions";

type LaneChrome = {
  githubConnections: Awaited<ReturnType<typeof getGithubLaneConnections>>;
  githubLaneId: string | null;
  openGithubSettings: (laneId: string) => void;
  closeGithubSettings: () => void;
  editingLaneId: string | null;
  removingLaneId: string | null;
  startRename: (laneId: string) => void;
  stopRename: () => void;
  startRemove: (laneId: string) => void;
  stopRemove: () => void;
};

const LaneChromeContext = createContext<LaneChrome | null>(null);

export function useLaneChrome(): LaneChrome {
  const value = useContext(LaneChromeContext);
  if (value === null) {
    throw new Error("useLaneChrome must be used within LaneChromeProvider");
  }

  return value;
}

export function LaneChromeProvider({ children }: { children: ReactNode }) @{
  const [editingLaneId, setEditingLaneId] = useState<string | null>(null);
  const [removingLaneId, setRemovingLaneId] = useState<string | null>(null);
  const [githubLaneId, setGithubLaneId] = useState<string | null>(null);
  const [githubConnections, setGithubConnections] = useState<LaneChrome["githubConnections"]>([]);
  useEffect(() => {
    if (githubLaneId !== null) {
      return;
    }
    let active = true;
    let request = 0;
    const refreshGithubConnections = Effect.fn("refreshGithubConnections")(
      function* () {
        if (!navigator.onLine) {
          return;
        }
        const requestId = ++request;
        const connections = yield* fromGithubPromise(() => getGithubLaneConnections());
        if (active && requestId === request) {
          setGithubConnections(connections);
        }
      },
      // Keep the last known indicators while the server is unreachable.
      Effect.ignore,
    );
    const refreshConnections = () => Effect.runPromise(refreshGithubConnections());
    void refreshConnections();
    window.addEventListener("focus", refreshConnections);
    window.addEventListener("online", refreshConnections);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshConnections);
      window.removeEventListener("online", refreshConnections);
    };
  }, [githubLaneId]);
  useEffect(() => {
    try {
      setGithubLaneId(sessionStorage.getItem("sidequest:github-lane"));
    } catch {
      // Modal remains usable when browser storage is unavailable.
    }
  }, []);
  const value = useMemo(
    () => ({
      githubConnections,
      githubLaneId,
      openGithubSettings: (laneId: string) => {
        setGithubLaneId(laneId);
        try {
          sessionStorage.setItem("sidequest:github-lane", laneId);
        } catch {
          /* Optional return destination. */
        }
      },
      closeGithubSettings: () => {
        setGithubLaneId(null);
        try {
          sessionStorage.removeItem("sidequest:github-lane");
        } catch {
          /* Optional return destination. */
        }
      },
      editingLaneId,
      removingLaneId,
      startRename: setEditingLaneId,
      stopRename: () => {
        setEditingLaneId(null);
      },
      startRemove: setRemovingLaneId,
      stopRemove: () => {
        setRemovingLaneId(null);
      },
    }),
    [editingLaneId, removingLaneId, githubLaneId, githubConnections],
  );

  <LaneChromeContext value={value}>{children}</LaneChromeContext>;
}
