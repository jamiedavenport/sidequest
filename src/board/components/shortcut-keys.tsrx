import { formatForDisplay } from "@tanstack/hotkeys";
import { useEffect, useState } from "react";

import { Kbd, KbdGroup } from "~/components/ui/kbd.tsrx";

export const navigateHotkeys = ["ArrowUp", "ArrowDown"];
export const completeHotkeys = ["Mod+Enter"];
export const nestHotkeys = ["Tab"];
export const moveTaskHotkeys = ["Mod+Shift+ArrowUp", "ArrowDown"];
export const moveLaneHotkeys = ["Mod+Shift+ArrowLeft", "ArrowRight"];
export const saveHotkeys = ["Enter"];
export const addHotkeys = ["C"];
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
