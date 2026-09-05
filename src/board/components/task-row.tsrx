// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

import { useBoardClient } from "~/board/sync/client";
import { BoardActor } from "~/board/navigation/machine";
import { completeTask } from "~/board/data/mutations";
import { TaskEdit } from "~/board/components/task-edit.tsrx";
import { editHotkeys, notesHotkeys, ShortcutKeys } from "~/board/components/shortcut-keys.tsrx";
import { Badge } from "~/components/ui/badge.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu.tsrx";
import {
  Item,
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
  const [iconFailed, setIconFailed] = useState(false);
  const showIcon = attachment.icon !== undefined && !iconFailed;

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
        "size-7.5 rounded-md sm:size-6.25",
        showIcon
          ? "overflow-hidden bg-secondary p-0.5 [&_img]:object-contain"
          : cn(
              "bg-secondary text-[0.625rem] font-semibold",
              attachment.mark === "GH" && "bg-foreground text-[0.5rem] text-background",
            ),
      )}
      variant={showIcon ? "image" : "default"}
      aria-hidden="true"
    >
      @if (showIcon) {
        <img alt="" src={attachment.icon} onError={() => setIconFailed(true)} />;
      } @else {
        <span>{attachment.mark}</span>;
      }
    </ItemMedia>
    <ItemContent>
      <ItemTitle className="text-sm/5 text-foreground sm:text-xs/4">{attachment.label}</ItemTitle>
      <ItemDescription className="line-clamp-1 text-sm/5 sm:text-xs/4">
        {attachment.meta}
      </ItemDescription>
    </ItemContent>
  </Item>;
}

function TaskMetadata({ task }: { task: BoardTask }) @{
  @if (task.date !== undefined) {
    <div className="flex flex-wrap items-center gap-1.5 pt-2 text-sm/5 sm:text-[0.625rem]/4">
      @if (task.date !== undefined) {
        <Badge variant={task.date === "Today" ? "today" : "secondary"}>{task.date}</Badge>;
      }
    </div>;
  }
}

function CompleteTaskButton({ task }: { task: Task }) @{
  const client = useBoardClient();
  const actorRef = BoardActor.useActorRef();

  function onComplete(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    actorRef.send({ type: "edit.cancel" });
    completeTask(client, task.id);
  }

  <Button
    className="relative z-10 size-5 rounded-full border border-input bg-white p-0 sm:size-4"
    size="icon"
    type="button"
    variant="ghost"
    aria-label={`Complete ${task.title}`}
    onClick={onComplete}
  >
    <span
      className="pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
      aria-hidden="true"
    />
  </Button>;
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
    data-task-select=""
    onClick={onSelect}
    onMouseDown={onSelect}
  />;
}

function TaskOptions({ laneId, task }: { laneId: string; task: Task }) @{
  const actorRef = BoardActor.useActorRef();

  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button
          className="relative z-10 size-5 opacity-100 sm:size-4 sm:opacity-0 sm:group-focus-within/task:opacity-100 sm:group-hover/task:opacity-100"
          size="icon"
          type="button"
          variant="ghost"
          aria-label={`${task.title} options`}
        />
      }
    >
      <Ellipsis aria-hidden="true" />
      <span
        className="pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        aria-hidden="true"
      />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem
        onClick={() => {
          actorRef.send({ type: "notes.open", taskId: task.id, laneId });
        }}
      >
        Notes
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={notesHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          actorRef.send({ type: "edit.start", taskId: task.id, laneId });
        }}
      >
        Edit
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={editHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function TaskRow({ laneId, task }: { laneId: string; task: BoardTask }) @{
  const editing = BoardActor.useSelector(
    (snapshot) =>
      snapshot.value === "editing" &&
      snapshot.context.cursor.taskId === task.id &&
      snapshot.context.cursor.laneId === laneId,
  );
  const highlighted = BoardActor.useSelector(
    (snapshot) =>
      snapshot.value === "navigating" &&
      snapshot.context.cursor.taskId === task.id &&
      snapshot.context.cursor.laneId === laneId,
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
        "group/task relative rounded-lg p-2.5 select-none sm:p-2",
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
      @if (!editing) {
        <SelectTaskButton laneId={laneId} task={task} />;
      }
      <div className="pointer-events-none relative flex min-w-0 items-start gap-2.5 sm:gap-2">
        <div className="pointer-events-auto flex h-6 items-center sm:h-4.25">
          <CompleteTaskButton task={task} />
        </div>
        @if (editing) {
          <TaskEdit laneId={laneId} task={task} />;
        } @else {
          <>
            <div className="relative min-w-0 flex-1 pr-8 text-base/6 sm:text-[0.8125rem]/4.25">
              <p className="[overflow-wrap:anywhere] whitespace-pre-wrap text-foreground/90">
                {task.title}
              </p>
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
            <div className="pointer-events-auto absolute top-0 right-0 flex h-6 items-center sm:h-4.25">
              <TaskOptions laneId={laneId} task={task} />
            </div>
          </>;
        }
      </div>
    </div>
  </li>;
}
