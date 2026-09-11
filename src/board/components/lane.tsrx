// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useLaneDrag, laneDragId } from "./board-drag.tsrx";
import { useLaneChrome } from "./lane-chrome.tsrx";
import { LaneContent } from "./lane/content.tsrx";
import { LanePrivacyToggle, LanePrivacyOverlay, HiddenLaneContent } from "./lane/privacy.tsrx";
import { addLaneHotkeys, ShortcutKeys } from "./shortcut-keys.tsrx";
import { addLane } from "~/board/data/mutations";
import { useBoardStore, useBoardSelector } from "~/board/navigation/provider.tsrx";
import { BoardEvent, currentLaneId, selectedTaskId } from "~/board/navigation/model";
import { useBoardClient } from "~/board/sync/client.tsrx";
import type { BoardLane } from "~/board/types";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty.tsrx";

export function TaskLane({ lane }: { lane: BoardLane }) @{
  const selected = useBoardSelector((snapshot) => currentLaneId(snapshot) === lane.id);
  const taskIdSelected = useBoardSelector(selectedTaskId);
  const hidden = lane.hidden;
  const focusedWithoutTask =
    selected && (taskIdSelected === null || !lane.tasks.some((task) => task.id === taskIdSelected));
  const articleRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dropEdge = useLaneDrag(lane.id, articleRef, headerRef);

  useEffect(() => {
    if (focusedWithoutTask) {
      articleRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [focusedWithoutTask]);

  <article
    ref={articleRef}
    data-board-drop={laneDragId(lane.id)}
    data-lane-drop=""
    data-drop-edge={dropEdge}
    className={cn(
      "relative flex h-full w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-hidden border-t-2 border-r border-border bg-white px-2 py-5 sm:w-87 sm:px-3 sm:py-4.5",
      selected ? "border-t-primary" : "border-t-transparent",
      dropEdge === "append" && "bg-primary/5 ring-2 ring-primary/40 ring-inset",
      dropEdge === "before" && "border-l-2 border-l-primary",
      dropEdge === "after" && "border-r-2 border-r-primary",
    )}
    aria-current={selected ? "true" : undefined}
    aria-labelledby={hidden ? undefined : `${lane.id}-title`}
    aria-label={hidden ? "Hidden lane" : undefined}
    data-lane-id={lane.id}
    data-private={hidden ? "true" : undefined}
  >
    @if (hidden) {
      <>
        <div className="absolute top-5 right-4 z-20 sm:top-4.5">
          <LanePrivacyToggle laneId={lane.id} />
        </div>
        <HiddenLaneContent lane={lane} />
        <LanePrivacyOverlay laneId={lane.id} selected={selected} />
      </>;
    } @else {
      <LaneContent lane={lane} selected={selected} headerRef={headerRef} />;
    }
  </article>;
}

export function AddLaneButton() @{
  const client = useBoardClient();
  const store = useBoardStore();
  const { startRename } = useLaneChrome();

  function onAdd() {
    store.send(BoardEvent.EditCancel({}));
    const laneId = addLane(client);
    store.send(BoardEvent.LaneSelect({ viewId: laneId }));
    startRename(laneId);
  }

  <button
    className="flex h-full w-[calc(100vw-1.5rem)] shrink-0 cursor-pointer flex-col border-t-2 border-transparent p-2 text-left outline-none hover:bg-muted/25 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:w-87 sm:p-3"
    type="button"
    aria-label="New lane"
    onClick={onAdd}
  >
    <Empty className="h-full min-h-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Plus aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-lg sm:text-sm">New lane</EmptyTitle>
        <EmptyDescription className="text-pretty text-sm/5 sm:text-xs/4">
          Create a lane for a project or area of work.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="hidden sm:flex">
        <ShortcutKeys hotkeys={addLaneHotkeys} />
      </EmptyContent>
    </Empty>
  </button>;
}
