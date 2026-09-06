import { formatForDisplay } from "@tanstack/hotkeys";
import { useEffect, useState } from "react";

import { Kbd, KbdGroup } from "~/components/ui/kbd.tsrx";

export const navigateHotkeys = ["ArrowUp", "ArrowDown"];
export const completeHotkey = "Enter";
export const completeHotkeys = [completeHotkey];
export const dateHotkey = "Mod+Shift+D";
export const editHotkey = "E";
export const editHotkeys = [editHotkey];
export const notesHotkey = "N";
export const notesHotkeys = [notesHotkey];
export const whiteboardHotkey = "W";
export const whiteboardHotkeys = [whiteboardHotkey];
export const nestHotkeys = ["Tab"];
export const collapseHotkey = "Space";
export const collapseHotkeys = [collapseHotkey];
export const moveTaskHotkeys = ["Mod+Shift+ArrowUp", "ArrowDown"];
export const moveAcrossHotkeys = ["Mod+Shift+ArrowLeft", "ArrowRight"];
export const moveLaneHotkeys = ["Mod+Alt+ArrowLeft", "ArrowRight"];
export const moveLaneLeftHotkeys = ["Mod+Alt+ArrowLeft"];
export const moveLaneRightHotkeys = ["Mod+Alt+ArrowRight"];
export const saveHotkey = "Mod+Enter";
export const saveHotkeys = [saveHotkey];
export const addHotkeys = ["C"];
export const addLaneHotkeys = ["L"];
export const renameLaneHotkeys = ["R"];
export const removeLaneHotkeys = ["Mod+Backspace"];
export const inboxHotkeys = ["I"];
export const todayHotkeys = ["T"];

export function shortcutLabels(hotkeys: string[]): string[] {
  return hotkeys.flatMap((hotkey) =>
    formatForDisplay(hotkey)
      .split(/[\s+]+/)
      .filter(Boolean),
  );
}

export function ShortcutKeys({ hotkeys }: { hotkeys: string[] }) @{
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    setLabels(shortcutLabels(hotkeys));
  }, [hotkeys]);

  <KbdGroup>
    @for (const [index, label] of labels.entries(); key `${label}-${index}`) {
      <Kbd>{label}</Kbd>;
    }
  </KbdGroup>;
}

export function ShortcutLabel({ hotkey }: { hotkey: string }) @{
  const [label, setLabel] = useState("");

  useEffect(() => {
    setLabel(formatForDisplay(hotkey));
  }, [hotkey]);

  <Kbd className="hidden sm:inline-flex">{label}</Kbd>;
}
