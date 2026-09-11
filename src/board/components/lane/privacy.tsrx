// oxlint-disable react-perf/jsx-no-new-function-as-prop
import type { BoardLane } from "~/board/types";
import { LaneSymbol } from "./symbol.tsrx";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { BoardEvent } from "~/board/navigation/model";
import { useBoardStore } from "~/board/navigation/provider.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty.tsrx";
import { privacyHotkeys, ShortcutKeys } from "../shortcut-keys.tsrx";
import { useLanePrivacy } from "./privacy-provider.tsrx";

export function LanePrivacyToggle({ laneId }: { laneId: string }) @{
  const { hiddenLaneIds, toggleLanePrivacy, canToggle } = useLanePrivacy();
  const hidden = hiddenLaneIds.includes(laneId);
  function toggle() {
    toggleLanePrivacy(laneId);
  }

  <Button
    size="icon"
    variant="ghost"
    className="bg-white/80 text-muted-foreground"
    aria-label={hidden ? "Show lane" : "Hide lane"}
    aria-pressed={hidden}
    title={hidden ? "Show lane (P)" : "Hide lane (P)"}
    disabled={!canToggle}
    onClick={toggle}
  >
    @if (hidden) {
      <EyeOff aria-hidden="true" />;
    } @else {
      <Eye aria-hidden="true" />;
    }
  </Button>;
}

export function LanePrivacyOverlay({
  laneId,
  selected,
}: {
  laneId: string;
  selected: boolean;
}) @{
  const store = useBoardStore();
  const { toggleLanePrivacy, canToggle } = useLanePrivacy();
  function selectLane() {
    store.send(BoardEvent.LaneSelect({ viewId: laneId }));
  }
  function showLane() {
    toggleLanePrivacy(laneId);
  }

  <div className="absolute inset-0 z-10">
    <button
      type="button"
      className="absolute inset-0 h-full w-full cursor-pointer bg-white/30 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      aria-label="Select hidden lane"
      onClick={selectLane}
    />
    <div
      className={cn(
        "pointer-events-none absolute inset-0 grid place-items-center transition-[opacity,transform] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none",
        selected
          ? "scale-100 opacity-100 animate-in fade-in zoom-in-95 motion-reduce:animate-none"
          : "scale-95 opacity-0",
      )}
      inert={!selected}
      aria-hidden={!selected}
    >
      <Empty className="w-full flex-none gap-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <EyeOff aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Lane hidden</EmptyTitle>
          <EmptyDescription>Show this lane to view or change its content.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            className="pointer-events-auto"
            aria-label="Show Lane"
            disabled={!canToggle}
            onClick={showLane}
          >
            Show Lane <ShortcutKeys hotkeys={privacyHotkeys} />
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  </div>;
}

export function HiddenLaneContent({ lane }: { lane: BoardLane }) @{
  <div
    className="pointer-events-none flex min-h-0 flex-1 select-none flex-col blur-lg"
    inert
    aria-hidden="true"
  >
    <div className="flex h-8 items-center gap-2.5 px-2 pr-12 sm:px-1 sm:pr-11">
      <LaneSymbol colour={lane.colour} shape={lane.shape} />
      <span className="truncate text-lg font-semibold sm:text-sm">{lane.title}</span>
      <span className="text-sm text-muted-foreground">{lane.tasks.length}</span>
    </div>
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden pt-4 sm:pt-3.5">
      @for (const task of lane.tasks; key task.id) {
        <div className="flex gap-2.5 p-2.5 sm:gap-2 sm:p-2">
          <span className="mt-0.5 size-4 shrink-0 rounded border border-border" />
          <span className="text-base/6 whitespace-pre-wrap sm:text-[0.8125rem]/4.25">
            {task.title}
          </span>
        </div>;
      }
    </div>
  </div>;
}
