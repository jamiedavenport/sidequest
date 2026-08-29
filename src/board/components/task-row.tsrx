// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useHotkey } from "@tanstack/react-hotkeys";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { BoardActor } from "~/board/machine";
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
import type { Task, TaskLink } from "~/board/types";

function LinkPreview({ link }: { link: TaskLink }) @{
  <Item
    className="min-w-0 flex-nowrap bg-foreground/2 text-foreground no-underline"
    href={link.href}
    rel="noreferrer"
    size="xs"
    target="_blank"
    variant="outline"
  >
    <ItemMedia
      className={cn(
        "size-7.5 rounded-md bg-secondary text-[0.625rem] font-semibold sm:size-6.25",
        link.mark === "GH" && "bg-foreground text-[0.5rem] text-background",
      )}
      aria-hidden="true"
    >
      {link.mark}
    </ItemMedia>
    <ItemContent>
      <ItemTitle className="text-sm/5 text-foreground sm:text-xs/4">{link.label}</ItemTitle>
      <ItemDescription className="line-clamp-1 text-sm/5 sm:text-xs/4">{link.meta}</ItemDescription>
    </ItemContent>
    <ItemActions className="shrink-0 text-sm/5 text-muted-foreground sm:text-xs/4">
      @if (link.stat !== undefined) {
        <span className="tabular-nums">{link.stat}</span>;
      } @else {
        <ExternalLink className="size-4 shrink-0" aria-hidden="true" />;
      }
    </ItemActions>
  </Item>;
}

function TaskMetadata({ task }: { task: Task }) @{
  @if (
    task.date !== undefined ||
    task.recurrence !== undefined ||
    task.subtaskProgress !== undefined
  ) {
    <div className="flex flex-wrap items-center gap-1.5 pt-2 text-sm/5 sm:text-[0.625rem]/4">
      @if (task.date !== undefined) {
        <Badge variant={task.date === "Today" ? "today" : "secondary"}>{task.date}</Badge>;
      }
      @if (task.recurrence !== undefined) {
        <Badge className="gap-1" variant="secondary">
          <span aria-hidden="true">↻</span>
          {task.recurrence}
        </Badge>;
      }
      @if (task.subtaskProgress !== undefined) {
        <Badge variant="ghost">{task.subtaskProgress}</Badge>;
      }
    </div>;
  }
}

function SelectedTaskHotkeys({ taskId }: { taskId: string }) @{
  const actorRef = BoardActor.useActorRef();

  useHotkey(
    "Mod+Enter",
    () => {
      actorRef.send({ type: "task.complete", taskId });
    },
    { ignoreInputs: true, meta: { name: "Complete" } },
  );
  useHotkey(
    "Tab",
    () => {
      actorRef.send({ type: "task.nest", delta: 1 });
    },
    { ignoreInputs: true, meta: { name: "Nest" } },
  );
  useHotkey(
    "Shift+Tab",
    () => {
      actorRef.send({ type: "task.nest", delta: -1 });
    },
    { ignoreInputs: true, meta: { name: "Unnest" } },
  );

  <></>;
}

function CompleteTaskButton({ task }: { task: Task }) @{
  const actorRef = BoardActor.useActorRef();

  function onComplete(event: { stopPropagation: () => void }) {
    event.stopPropagation();
    actorRef.send({ type: "task.complete", taskId: task.id });
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

function SelectTaskButton({ task }: { task: Task }) @{
  const actorRef = BoardActor.useActorRef();

  function onSelect(event: { button: number }) {
    if (event.button !== 0) {
      return;
    }

    actorRef.send({ type: "task.select", taskId: task.id });
  }

  <button
    className="absolute inset-0 cursor-pointer rounded-lg"
    type="button"
    aria-label={`Select ${task.title}`}
    onClick={onSelect}
    onMouseDown={onSelect}
  />;
}

export function TaskRow({ task }: { task: Task }) @{
  const highlighted = BoardActor.useSelector(
    (snapshot) => snapshot.value === "navigating" && snapshot.context.selectedId === task.id,
  );
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (highlighted) {
      rowRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [highlighted]);

  <li
    ref={rowRef}
    className={cn(
      "relative",
      task.depth === 1 && "pl-10 sm:pl-9",
      task.depth === 2 && "pl-18 sm:pl-16",
    )}
    id={`task-${task.id}`}
    aria-current={highlighted ? "true" : undefined}
  >
    @if (highlighted) {
      <SelectedTaskHotkeys taskId={task.id} />;
    }
    <div
      className={cn(
        "relative rounded-lg p-2.5 select-none sm:p-2",
        highlighted && "ring-2 ring-primary/25 ring-inset",
      )}
    >
      @if (task.depth !== undefined) {
        <svg
          className="-left-5 sm:-left-4.5 pointer-events-none absolute top-0 h-5 w-5 overflow-visible text-border sm:h-4 sm:w-4"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="M0 0V10C0 15.523 4.477 20 10 20H20" stroke="currentColor" />
        </svg>;
      }
      <SelectTaskButton task={task} />
      <div className="pointer-events-none relative flex min-w-0 items-start gap-2.5 sm:gap-2">
        <div className="pointer-events-auto flex h-6 items-center sm:h-4.25">
          <CompleteTaskButton task={task} />
        </div>
        <div className="relative min-w-0 flex-1 text-base/6 sm:text-[0.8125rem]/4.25">
          <p className="[overflow-wrap:anywhere] text-foreground/90">{task.title}</p>
          <TaskMetadata task={task} />
          @if (task.link !== undefined) {
            <div className="pointer-events-auto pt-2 text-sm/5 sm:text-[0.6875rem]/4">
              <LinkPreview link={task.link} />
            </div>;
          }
        </div>
      </div>
    </div>
  </li>;
}
