import { Ellipsis } from "lucide-react";

import { Button } from "~/components/ui/button.tsrx";
import { LaneSymbol } from "~/board/components/lane/symbol.tsrx";
import { QuickAdd } from "~/board/components/quick-add.tsrx";
import { TaskRow } from "~/board/components/task-row.tsrx";
import type { Lane } from "~/board/types";

export function TaskLane({ lane }: { lane: Lane }) @{
  <article
    className="flex h-full w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-y-auto border-r border-border bg-white px-2 py-5 sm:w-87 sm:px-3 sm:py-4.5"
    aria-labelledby={`${lane.id}-title`}
  >
    <div className="flex min-w-0 items-center justify-between gap-3 px-2 sm:px-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <LaneSymbol colour={lane.colour} shape={lane.shape} />
        <h2
          className="truncate text-lg font-semibold tracking-tight sm:text-sm"
          id={`${lane.id}-title`}
        >
          {lane.title}
        </h2>
        <span className="tabular-nums text-sm text-muted-foreground sm:text-xs">
          {lane.tasks.length}
        </span>
      </div>
      <Button size="icon" type="button" variant="ghost" aria-label={`${lane.title} options`}>
        <Ellipsis aria-hidden="true" />
      </Button>
    </div>
    <p className="pl-8.5 text-pretty text-sm/5 text-muted-foreground sm:pl-7 sm:text-xs/4">
      {lane.caption}
    </p>
    <div className="flex flex-1 flex-col gap-2 pt-4 sm:gap-1.5 sm:pt-3.5">
      <ul className="flex flex-col gap-0.5">
        @for (const task of lane.tasks; key task.id) {
          <TaskRow task={task} />;
        }
      </ul>
      <QuickAdd lane={lane} />
    </div>
  </article>;
}

export function AddLaneButton() @{
  <div className="hidden w-44 shrink-0 p-4 sm:block">
    <Button className="justify-start text-muted-foreground" size="sm" type="button" variant="ghost">
      <span aria-hidden="true">+</span>
      New lane
    </Button>
  </div>;
}
