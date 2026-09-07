// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { Effect } from "effect";
import { GitHubIcon } from "~/github/icon.tsrx";
import { ChevronDown, ChevronRight, Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { useTaskDrag, taskDragId } from "~/board/components/board-drag.tsrx";

import { cn } from "@/lib/utils";

import { useBoardClient } from "~/board/sync/client";
import { useBoardStore, useBoardSelector } from "~/board/navigation/provider.tsrx";
import { BoardEvent, currentLaneId, selectedTaskId } from "~/board/navigation/model";
import { completeTask, setTaskCollapsed } from "~/board/data/mutations";
import { TaskEdit } from "~/board/components/task-edit.tsrx";
import {
  collapseHotkeys,
  editHotkeys,
  notesHotkeys,
  ShortcutKeys,
  whiteboardHotkeys,
} from "~/board/components/shortcut-keys.tsrx";
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
import { hasActiveTaskChildren } from "~/board/views";

type TaskIndentStyle = CSSProperties & {
  "--task-indent": string;
  "--task-indent-sm": string;
};

function AttachmentPreview({ attachment }: { attachment: Attachment }) @{
  const [iconFailed, setIconFailed] = useState(false);
  const github = attachment.type === "github-issue";
  const icon = github ? undefined : attachment.icon;
  const showIcon = icon !== undefined && !iconFailed;
  const mark = github ? "GH" : attachment.mark;
  const label = github ? `${attachment.repository} #${attachment.number}` : attachment.label;
  const meta = github ? attachment.title : attachment.meta;

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
              mark === "GH" && "bg-foreground text-[0.5rem] text-background",
            ),
      )}
      variant={showIcon ? "image" : "default"}
      aria-hidden="true"
    >
      @if (github) {
        <GitHubIcon className="size-4" />;
      } @else if (showIcon) {
        <img alt="" src={icon} onError={() => setIconFailed(true)} />;
      } @else {
        <span>{mark}</span>;
      }
    </ItemMedia>
    <ItemContent>
      <ItemTitle className="text-sm/5 text-foreground sm:text-xs/4">{label}</ItemTitle>
      <ItemDescription className="line-clamp-1 text-sm/5 sm:text-xs/4">{meta}</ItemDescription>
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
  const store = useBoardStore();

  function onComplete(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    store.send(BoardEvent.EditCancel({}));
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
  const store = useBoardStore();

  function onSelect(event: { button: number }) {
    if (event.button !== 0) {
      return;
    }

    store.send(BoardEvent.TaskSelect({ target: { viewId: laneId, taskId: task.id } }));
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

function toggleTaskSubtree(
  client: ReturnType<typeof useBoardClient>,
  store: ReturnType<typeof useBoardStore>,
  laneId: string,
  task: BoardTask,
) {
  store.send(BoardEvent.TaskSelect({ target: { viewId: laneId, taskId: task.id } }));
  void Effect.runPromise(setTaskCollapsed(client, task.id, !task.collapsed)).catch(
    (error: unknown) => {
      console.error("Failed to toggle task subtree", error);
    },
  );
}

function TaskDisclosure({
  hasChildren,
  laneId,
  task,
}: {
  hasChildren: boolean;
  laneId: string;
  task: BoardTask;
}) @{
  const client = useBoardClient();
  const store = useBoardStore();

  @if (hasChildren) {
    <Button
      className="relative z-10 size-5 shrink-0 p-0 sm:size-4"
      size="icon"
      type="button"
      variant="ghost"
      aria-expanded={!task.collapsed}
      aria-label={`${task.collapsed ? "Expand" : "Collapse"} ${task.title}`}
      onClick={() => toggleTaskSubtree(client, store, laneId, task)}
    >
      @if (task.collapsed) {
        <ChevronRight aria-hidden="true" />;
      } @else {
        <ChevronDown aria-hidden="true" />;
      }
    </Button>;
  }
}

function TaskOptions({
  hasChildren,
  laneId,
  task,
}: {
  hasChildren: boolean;
  laneId: string;
  task: BoardTask;
}) @{
  const client = useBoardClient();
  const store = useBoardStore();

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
          store.send(
            BoardEvent.DetailsOpen({ target: { viewId: laneId, taskId: task.id }, tab: "notes" }),
          );
        }}
      >
        Notes
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={notesHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          store.send(
            BoardEvent.DetailsOpen({
              target: { viewId: laneId, taskId: task.id },
              tab: "whiteboard",
            }),
          );
        }}
      >
        Whiteboard
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={whiteboardHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          store.send(BoardEvent.EditStart({ target: { viewId: laneId, taskId: task.id } }));
        }}
      >
        Edit
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={editHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      @if (hasChildren) {
        <DropdownMenuItem onClick={() => toggleTaskSubtree(client, store, laneId, task)}>
          {task.collapsed ? "Expand subtree" : "Collapse subtree"}
          <DropdownMenuShortcut>
            <ShortcutKeys hotkeys={collapseHotkeys} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>;
      }
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function TaskRow({ laneId, task }: { laneId: string; task: BoardTask }) @{
  const client = useBoardClient();
  const editing = useBoardSelector(
    (snapshot) =>
      snapshot.interaction._tag === "Editing" &&
      selectedTaskId(snapshot) === task.id &&
      currentLaneId(snapshot) === laneId,
  );
  const highlighted = useBoardSelector(
    (snapshot) =>
      snapshot.interaction._tag === "Navigating" &&
      selectedTaskId(snapshot) === task.id &&
      currentLaneId(snapshot) === laneId,
  );
  const rowRef = useRef<HTMLLIElement>(null);
  const dropEdge = useTaskDrag(laneId, task.id, rowRef);
  const hasChildren = hasActiveTaskChildren(client.tasks.toArray, task.id);
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
    data-board-drop={taskDragId(laneId, task.id)}
    data-drop-edge={dropEdge}
    className={cn(
      "relative",
      dropEdge === "nest" && "rounded-lg bg-primary/10 ring-2 ring-primary/50 ring-inset",
      dropEdge === "before" &&
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-20 before:h-0.5 before:bg-primary",
      dropEdge === "after" &&
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-20 after:h-0.5 after:bg-primary",
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
          <TaskDisclosure hasChildren={hasChildren} laneId={laneId} task={task} />
        </div>
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
              <TaskOptions hasChildren={hasChildren} laneId={laneId} task={task} />
            </div>
          </>;
        }
      </div>
    </div>
  </li>;
}
