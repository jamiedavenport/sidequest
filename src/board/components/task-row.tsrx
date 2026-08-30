// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { useOptionalBoardClient } from "~/board/sync/client";
import { BoardActor } from "~/board/navigation/machine";
import { completeTask } from "~/board/data/mutations";
import { Badge } from "~/components/ui/badge.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item.tsrx";
import type { Attachment, BoardTask, Task } from "~/board/types";

type TaskIndentStyle = CSSProperties & {
  "--task-indent": string;
  "--task-indent-sm": string;
};

function AttachmentPreview({ attachment }: { attachment: Attachment }) @{
  <Item
    className="min-w-0 flex-nowrap bg-foreground/2 text-foreground no-underline"
    href={attachment.href}
    rel="noreferrer"
    size="xs"
    target="_blank"
    variant="outline"
  >
    <ItemMedia
      className={cn(
        "size-7.5 rounded-md bg-secondary text-[0.625rem] font-semibold sm:size-6.25",
        attachment.mark === "GH" && "bg-foreground text-[0.5rem] text-background",
      )}
      aria-hidden="true"
    >
      {attachment.mark}
    </ItemMedia>
    <ItemContent>
      <ItemTitle className="text-sm/5 text-foreground sm:text-xs/4">{attachment.label}</ItemTitle>
      <ItemDescription className="line-clamp-1 text-sm/5 sm:text-xs/4">
        {attachment.meta}
      </ItemDescription>
    </ItemContent>
    <ItemActions className="shrink-0 text-sm/5 text-muted-foreground sm:text-xs/4">
      @if (attachment.stat !== undefined) {
        <span className="tabular-nums">{attachment.stat}</span>;
      } @else {
        <ExternalLink className="size-4 shrink-0" aria-hidden="true" />;
      }
    </ItemActions>
  </Item>;
}

function TaskMetadata({ task }: { task: BoardTask }) @{
  @if (task.date !== undefined || task.subtaskProgress !== undefined) {
    <div className="flex flex-wrap items-center gap-1.5 pt-2 text-sm/5 sm:text-[0.625rem]/4">
      @if (task.date !== undefined) {
        <Badge variant={task.date === "Today" ? "today" : "secondary"}>{task.date}</Badge>;
      }
      @if (task.subtaskProgress !== undefined) {
        <Badge variant="ghost">
          {task.subtaskProgress.completed}/{task.subtaskProgress.total}{" "}
          {task.subtaskProgress.total === 1 ? "subtask" : "subtasks"}
        </Badge>;
      }
    </div>;
  }
}

function CompleteTaskButton({ task }: { task: Task }) @{
  const client = useOptionalBoardClient();

  function onComplete(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    if (client !== null) {
      completeTask(client, task.id);
    }
  }

  <Button
    className="relative z-10 size-5 rounded-full border border-input bg-white p-0 sm:size-4"
    size="icon"
    type="button"
    variant="ghost"
    aria-label={`Complete ${task.title}`}
    onClick={onComplete}
  />;
}

function SelectTaskButton({ laneId, task }: { laneId: string; task: Task }) @{
  const actorRef = BoardActor.useActorRef();

  function onSelect(event: { button: number }) {
    if (event.button !== 0) {
      return;
    }

    actorRef.send({ type: "task.select", taskId: task.id, laneId });
  }

  <button
    className="absolute inset-0 cursor-pointer rounded-lg"
    type="button"
    aria-label={`Select ${task.title}`}
    onClick={onSelect}
    onMouseDown={onSelect}
  />;
}

export function TaskRow({ laneId, task }: { laneId: string; task: BoardTask }) @{
  const highlighted = BoardActor.useSelector(
    (snapshot) =>
      snapshot.value === "navigating" &&
      snapshot.context.selectedId === task.id &&
      snapshot.context.selectedLaneId === laneId,
  );
  const rowRef = useRef<HTMLLIElement>(null);
  const indentStyle: TaskIndentStyle = {
    "--task-indent": `${8 + task.visualDepth * 32}px`,
    "--task-indent-sm": `${8 + task.visualDepth * 28}px`,
  };

  useEffect(() => {
    if (highlighted) {
      rowRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [highlighted]);

  <li
    ref={rowRef}
    className={cn(
      "relative",
      task.visualDepth > 0 && "pl-(--task-indent) sm:pl-(--task-indent-sm)",
    )}
    style={task.visualDepth === 0 ? undefined : indentStyle}
    id={`task-${laneId}-${task.id}`}
    aria-current={highlighted ? "true" : undefined}
  >
    <div
      className={cn(
        "relative rounded-lg p-2.5 select-none sm:p-2",
        highlighted && "ring-2 ring-primary/25 ring-inset",
      )}
    >
      @if (task.visualDepth > 0) {
        <svg
          className="-left-5 sm:-left-4.5 pointer-events-none absolute top-0 h-5 w-5 overflow-visible text-border sm:h-4 sm:w-4"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="M0 0V10C0 15.523 4.477 20 10 20H20" stroke="currentColor" />
        </svg>;
      }
      <SelectTaskButton laneId={laneId} task={task} />
      <div className="pointer-events-none relative flex min-w-0 items-start gap-2.5 sm:gap-2">
        <div className="pointer-events-auto flex h-6 items-center sm:h-4.25">
          <CompleteTaskButton task={task} />
        </div>
        <div className="relative min-w-0 flex-1 text-base/6 sm:text-[0.8125rem]/4.25">
          <p className="[overflow-wrap:anywhere] text-foreground/90">{task.title}</p>
          <TaskMetadata task={task} />
          @if (
            task.attachments !== undefined &&
            task.attachments.length > 0
          ) {
            <div className="pointer-events-auto flex flex-col gap-1 pt-2 text-sm/5 sm:text-[0.6875rem]/4">
              @for (const attachment of task.attachments; key attachment.id) {
                <AttachmentPreview attachment={attachment} />;
              }
            </div>;
          }
        </div>
      </div>
    </div>
  </li>;
}
