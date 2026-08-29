import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

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
import type { Task, TaskLink } from "~/components/board/types";

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
  <div className="flex flex-wrap items-center gap-1.5 pt-2 text-sm/5 sm:text-[0.625rem]/4">
    @if (task.date) {
      <Badge variant={task.date === "Today" ? "today" : "secondary"}>{task.date}</Badge>;
    }
    @if (task.recurrence) {
      <Badge className="gap-1" variant="secondary">
        <span aria-hidden="true">↻</span>
        {task.recurrence}
      </Badge>;
    }
    @if (task.subtaskProgress) {
      <Badge variant="ghost">{task.subtaskProgress}</Badge>;
    }
  </div>;
}

export function TaskRow({ task }: { task: Task }) @{
  <li
    className={cn(
      "relative flex min-w-0 items-start gap-2.5 rounded-lg p-2.5 sm:gap-2 sm:p-2",
      task.selected && "ring-2 ring-primary/25 ring-inset",
      task.depth === 1 && "pl-10 sm:pl-9",
      task.depth === 2 && "pl-18 sm:pl-16",
    )}
  >
    @if (task.depth) {
      <svg
        className={cn(
          "absolute top-0 h-5 w-5 overflow-visible text-border sm:h-4 sm:w-4",
          task.depth === 1 ? "left-5 sm:left-4.5" : "left-13 sm:left-11.5",
        )}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 0V10C0 15.523 4.477 20 10 20H20" stroke="currentColor" />
      </svg>;
    }
    <Button
      className="size-5 rounded-full border border-input bg-white p-0 sm:size-4"
      size="icon"
      type="button"
      variant="ghost"
      aria-label={`Complete ${task.title}`}
    />
    <div className="min-w-0 flex-1 text-base/6 sm:text-[0.8125rem]/4.25">
      <p className="[overflow-wrap:anywhere] text-foreground/90">{task.title}</p>
      <TaskMetadata task={task} />
      @if (task.link) {
        <div className="pt-2 text-sm/5 sm:text-[0.6875rem]/4">
          <LinkPreview link={task.link} />
        </div>;
      }
    </div>
  </li>;
}
