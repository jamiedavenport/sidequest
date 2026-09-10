import {
  CompleteTaskButton,
  SelectTaskButton,
  TaskDisclosure,
  TaskOptions,
} from "~/board/components/tasks/actions.tsrx";
import { TaskPasteAttachments } from "~/board/components/tasks/attachments/paste.tsrx";
import { TaskAttachments } from "~/board/components/tasks/attachments/list.tsrx";
// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { useTaskDrag, taskDragId } from "~/board/components/board-drag.tsrx";

import { cn } from "@/lib/utils";

import { useBoardClient } from "~/board/sync/client.tsrx";
import { useBoardSelector } from "~/board/navigation/provider.tsrx";
import { currentLaneId, selectedTaskId } from "~/board/navigation/model";
import { TaskEdit } from "~/board/components/tasks/edit.tsrx";
import { Badge } from "~/components/ui/badge.tsrx";
import type { BoardTask } from "~/board/types";
import { hasActiveTaskChildren } from "~/board/views";

const taskIndentBasePx = 8;

const taskIndentStepPx = 32;

const taskIndentSmallStepPx = 28;

type TaskIndentStyle = CSSProperties & {
  "--task-indent": string;
  "--task-indent-sm": string;
};

function TaskMetadata({ task }: { task: BoardTask }) @{
  @if (task.date !== undefined) {
    <div className="flex flex-wrap items-center gap-1.5 pt-2 text-sm/5 sm:text-[0.625rem]/4">
      <Badge variant={task.date === "Today" ? "today" : "secondary"}>{task.date}</Badge>
    </div>;
  }
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
    "--task-indent": `${taskIndentBasePx + task.visualDepth * taskIndentStepPx}px`,
    "--task-indent-sm": `${taskIndentBasePx + task.visualDepth * taskIndentSmallStepPx}px`,
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
      <TaskRowContent laneId={laneId} task={task} editing={editing} hasChildren={hasChildren} />
      <TaskPasteAttachments taskId={task.id} laneId={laneId} />
    </div>
  </li>;
}

function TaskRowContent({
  laneId,
  task,
  editing,
  hasChildren,
}: {
  laneId: string;
  task: BoardTask;
  editing: boolean;
  hasChildren: boolean;
}) @{
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
          <TaskAttachments task={task} />
        </div>
        <div className="pointer-events-auto absolute top-0 right-0 flex h-6 items-center sm:h-4.25">
          <TaskOptions hasChildren={hasChildren} laneId={laneId} task={task} />
        </div>
      </>;
    }
  </div>;
}
