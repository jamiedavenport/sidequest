// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useBoardClient } from "~/board/sync/client.tsrx";
import { updateLane } from "~/board/data/mutations";
import { isLanePrivate } from "~/board/data/privacy";
import { activeTaskCountForView } from "~/board/views";
import type { BoardLane } from "~/board/types";
import { Input } from "~/components/ui/input.tsrx";
import { useLaneChrome } from "../lane-chrome.tsrx";
import { StartAddButton } from "./start-add-button.tsrx";

export function LaneTitle({ lane }: { lane: BoardLane }) @{
  const client = useBoardClient();
  const { editingLaneId, stopRename } = useLaneChrome();
  const editing = editingLaneId === lane.id;
  const [draft, setDraft] = useState(lane.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const taskCount = activeTaskCountForView(client.tasks.toArray, lane.id);

  useLayoutEffect(() => {
    if (!editing) {
      return;
    }

    cancelledRef.current = false;
    setDraft(lane.title);
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [editing, lane.title]);

  function save() {
    if (cancelledRef.current || isLanePrivate(client, lane.id)) {
      return;
    }

    updateLane(client, lane.id, { title: draft });
    stopRename();
  }

  function cancel() {
    cancelledRef.current = true;
    stopRename();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  @if (editing) {
    <Input
      ref={titleRef}
      className="h-7 min-w-0 flex-1 px-1.5 text-lg font-semibold tracking-tight sm:text-sm"
      aria-label={`Rename ${lane.title}`}
      id={`${lane.id}-title`}
      value={draft}
      onBlur={save}
      onChange={(event) => {
        setDraft(event.currentTarget.value);
      }}
      onKeyDown={onKeyDown}
    />;
  } @else {
    <StartAddButton
      data-lane-drag-surface=""
      className="flex min-w-0 flex-1 items-center gap-2.5"
      lane={lane}
    >
      <h2
        className="truncate text-lg font-semibold tracking-tight sm:text-sm"
        id={`${lane.id}-title`}
      >
        {lane.title}
      </h2>
      <span className="tabular-nums text-sm text-muted-foreground sm:text-xs">{taskCount}</span>
    </StartAddButton>;
  }
}
