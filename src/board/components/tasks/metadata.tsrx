// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { eq, useLiveQuery } from "@tanstack/react-db";
import { PanelsTopLeft, StickyNote } from "lucide-react";
import type { KeyboardEvent, MouseEvent } from "react";

import { hasNoteContent, hasWhiteboardContent } from "~/board/detail-content";
import { BoardEvent, type DetailTab } from "~/board/navigation/model";
import { useBoardStore } from "~/board/navigation/provider.tsrx";
import { useBoardClient } from "~/board/sync/client.tsrx";
import type { Task } from "~/board/types";
import { Badge } from "~/components/ui/badge.tsrx";
import { Button } from "~/components/ui/button.tsrx";

export function TaskMetadata({ laneId, task }: { laneId: string; task: Task }) @{
  const client = useBoardClient();
  const notesQuery = useLiveQuery((query) =>
    query
      .from({ note: client.notes })
      .where(({ note }) => eq(note.taskId, task.id))
      .findOne(),
  );
  const whiteboardsQuery = useLiveQuery((query) =>
    query
      .from({ whiteboard: client.whiteboards })
      .where(({ whiteboard }) => eq(whiteboard.taskId, task.id))
      .findOne(),
  );
  const hasNotes = hasNoteContent(notesQuery.data?.content);
  const hasWhiteboard = hasWhiteboardContent(whiteboardsQuery.data?.document);

  @if (task.date !== undefined || hasNotes || hasWhiteboard) {
    <div className="flex flex-wrap items-center gap-1.5 pt-2 text-sm/5 sm:text-[0.625rem]/4">
      @if (task.date !== undefined) {
        <Badge variant={task.date === "Today" ? "today" : "secondary"}>{task.date}</Badge>;
      }
      @if (hasNotes) {
        <TaskContentButton laneId={laneId} taskId={task.id} title={task.title} tab="notes" />;
      }
      @if (hasWhiteboard) {
        <TaskContentButton
          laneId={laneId}
          taskId={task.id}
          title={task.title}
          tab="whiteboard"
        />;
      }
    </div>;
  }
}

function preserveButtonKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === "Enter" || event.key === " " || event.key === "Tab") {
    event.stopPropagation();
  }
}

function TaskContentButton({
  laneId,
  taskId,
  title,
  tab,
}: {
  laneId: string;
  taskId: string;
  title: string;
  tab: DetailTab;
}) @{
  const store = useBoardStore();
  const label = `Open ${tab} for ${title}`;
  const Icon = tab === "notes" ? StickyNote : PanelsTopLeft;

  function openDetails(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    store.send(BoardEvent.DetailsOpen({ target: { viewId: laneId, taskId }, tab }));
  }

  <Button
    className="pointer-events-auto size-8 text-muted-foreground pointer-coarse:size-11 sm:pointer-fine:size-5"
    size="icon-xs"
    type="button"
    variant="ghost"
    aria-label={label}
    title={label}
    onClick={openDetails}
    onKeyDownCapture={preserveButtonKeyboard}
  >
    <Icon className="size-3.5 sm:size-3" aria-hidden="true" />
  </Button>;
}
