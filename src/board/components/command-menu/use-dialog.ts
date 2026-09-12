import { useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { selectionOf } from "~/board/navigation/model";
import { useBoardSelector, useBoardStore } from "~/board/navigation/provider.tsrx";
import { useLaneChrome } from "../lane-chrome.tsrx";

export function useCommandDialog() {
  const store = useBoardStore();
  const mode = useBoardSelector((snapshot) => snapshot.interaction._tag);
  const { editingLaneId, removingLaneId, githubLaneId } = useLaneChrome();
  const [open, setOpen] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [selection, setSelection] = useState(() => selectionOf(store.getSnapshot().interaction));
  const available =
    mode === "Navigating" &&
    editingLaneId === null &&
    removingLaneId === null &&
    githubLaneId === null;

  function changeOpen(next: boolean) {
    if (next && !available) {
      return;
    }
    if (next && !open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection(selectionOf(store.getSnapshot().interaction));
    }
    setOpen(next);
  }

  function openCommandMenu() {
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) {
      return;
    }
    changeOpen(true);
  }

  useHotkey(
    "Mod+K",
    () => {
      if (!open) {
        openCommandMenu();
      }
    },
    {
      enabled: available,
      ignoreInputs: true,
      preventDefault: true,
      meta: { name: "Search tasks, lanes, and actions" },
    },
  );

  function restoreFocus() {
    const previous = previousFocus.current;
    if (previous?.isConnected) {
      previous.focus({ preventScroll: true });
      return;
    }
    document.querySelector<HTMLElement>("[data-board-focus]")?.focus({ preventScroll: true });
  }

  return { open, selection, available, changeOpen, openCommandMenu, restoreFocus };
}
