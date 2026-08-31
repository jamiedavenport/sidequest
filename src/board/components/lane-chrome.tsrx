import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type LaneChrome = {
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
  const value = useMemo(
    () => ({
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
    [editingLaneId, removingLaneId],
  );

  <LaneChromeContext value={value}>{children}</LaneChromeContext>;
}
