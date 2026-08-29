import { cn } from "@/lib/utils";

import type { LaneSymbolColour, LaneSymbolShape } from "~/board/types";

const colours: Record<LaneSymbolColour, string> = {
  green: "border-emerald-500/40 before:bg-emerald-500/60",
  amber: "border-amber-500/40 before:bg-amber-500/60",
  blue: "border-sky-500/40 before:bg-sky-500/60",
  violet: "border-violet-500/40 before:bg-violet-500/60",
};

const shapes: Record<LaneSymbolShape, string> = {
  square: "before:rounded-sm",
  circle: "before:rounded-full",
  diamond: "before:rotate-45 before:rounded-sm",
};

export function LaneSymbol({
  colour,
  shape,
}: {
  colour: LaneSymbolColour;
  shape: LaneSymbolShape;
}) @{
  <span
    className={cn(
      "relative flex size-5 shrink-0 items-center justify-center rounded-sm border before:size-1.5 sm:size-4",
      colours[colour],
      shapes[shape],
    )}
    aria-hidden="true"
  />;
}
