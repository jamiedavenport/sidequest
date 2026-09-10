import { useHotkey } from "@tanstack/react-hotkeys";
import type { RefObject } from "react";
import { isCaretOnFirstLine } from "~/board/caret";
import { saveHotkey } from "~/board/components/shortcut-keys.tsrx";

type ComposerHotkeys = {
  enabled?: boolean;
  calendarOpen: boolean;
  setCalendarOpen: (open: boolean) => void;
  titleRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
  onNavigateUp?: () => void;
  mode: "add" | "edit";
};

export function useComposerHotkeys({
  enabled = true,
  calendarOpen,
  setCalendarOpen,
  titleRef,
  onSubmit,
  onCancel,
  onNavigateUp,
  mode,
}: ComposerHotkeys) {
  useHotkey(
    saveHotkey,
    () => {
      void onSubmit();
    },
    {
      enabled: enabled && !calendarOpen,
      ignoreInputs: false,
      target: mode === "add" ? titleRef : undefined,
      meta: { name: mode === "add" ? "Add task" : "Save task" },
    },
  );
  useHotkey(
    "Escape",
    () => {
      if (calendarOpen) {
        setCalendarOpen(false);
        titleRef.current?.focus();
        return;
      }
      onCancel();
    },
    { enabled, ignoreInputs: false, meta: { name: mode === "add" ? "Cancel add" : "Cancel edit" } },
  );
  useHotkey(
    "ArrowUp",
    (event) => {
      const title = titleRef.current;
      if (!title || !isCaretOnFirstLine(title.value, title.selectionStart)) {
        return;
      }
      event.preventDefault();
      onNavigateUp?.();
    },
    {
      enabled: enabled && !calendarOpen && onNavigateUp !== undefined,
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
      target: titleRef,
      meta: { name: "Navigate up" },
    },
  );
}
