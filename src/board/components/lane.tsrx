// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { Ellipsis } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { useBoardClient } from "~/board/sync/client";
import { currentLaneId } from "~/board/navigation/commands";
import { BoardActor } from "~/board/navigation/machine";
import { addLane } from "~/board/data/mutations";
import { Button } from "~/components/ui/button.tsrx";
import { LaneSymbol } from "~/board/components/lane/symbol.tsrx";
import { QuickAdd } from "~/board/components/quick-add.tsrx";
import { TaskRow } from "~/board/components/task-row.tsrx";
import type { BoardLane } from "~/board/types";

function StartAddButton({
  lane,
  className,
  ...props
}: ComponentProps<"button"> & { lane: BoardLane }) @{
  const actorRef = BoardActor.useActorRef();

  function onStartAdd(event: { button: number; preventDefault: () => void }) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    actorRef.send({ type: "add.start", laneId: lane.id });
  }

  <button
    className={cn("text-left", className)}
    type="button"
    aria-label={`Add a task to ${lane.title}`}
    {...props}
    onMouseDown={onStartAdd}
  />;
}

export function TaskLane({ lane }: { lane: BoardLane }) @{
  const selected = BoardActor.useSelector(
    (snapshot) => currentLaneId(snapshot.context) === lane.id,
  );

  <article
    className={cn(
      "flex h-full w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-y-auto border-t-2 border-r border-border bg-white px-2 py-5 sm:w-87 sm:px-3 sm:py-4.5",
      selected ? "border-t-primary" : "border-t-transparent",
    )}
    aria-current={selected ? "true" : undefined}
    aria-labelledby={`${lane.id}-title`}
  >
    <div className="flex min-w-0 items-center justify-between gap-3 px-2 sm:px-1">
      <StartAddButton className="flex min-w-0 flex-1 items-center gap-2.5" lane={lane}>
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
      </StartAddButton>
      <Button size="icon" type="button" variant="ghost" aria-label={`${lane.title} options`}>
        <Ellipsis aria-hidden="true" />
      </Button>
    </div>
    <StartAddButton className="block w-full" lane={lane}>
      <p className="pl-8.5 text-pretty text-sm/5 text-muted-foreground sm:pl-7 sm:text-xs/4">
        {lane.caption}
      </p>
    </StartAddButton>
    <div className="flex flex-1 flex-col gap-2 pt-4 sm:gap-1.5 sm:pt-3.5">
      <ul className="flex flex-col gap-0.5">
        @for (const task of lane.tasks; key task.id) {
          <TaskRow laneId={lane.id} task={task} />;
        }
      </ul>
      <StartAddButton className="min-h-0 w-full flex-1" lane={lane} />
      <div className="relative mt-auto">
        <div
          className={cn(
            "origin-bottom transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            selected
              ? "scale-100 opacity-100"
              : "pointer-events-none scale-90 opacity-0 motion-reduce:scale-100",
          )}
          aria-hidden={selected ? undefined : true}
          inert={selected ? undefined : true}
        >
          <QuickAdd lane={lane} />
        </div>
        @if (!selected) {
          <StartAddButton className="absolute inset-0" lane={lane} />;
        }
      </div>
    </div>
  </article>;
}

export function AddLaneButton() @{
  const client = useBoardClient();
  const actorRef = BoardActor.useActorRef();

  function onAdd() {
    actorRef.send({ type: "lane.select", laneId: addLane(client) });
  }

  <div className="hidden w-44 shrink-0 p-4 sm:block">
    <Button
      className="justify-start text-muted-foreground"
      size="sm"
      type="button"
      variant="ghost"
      onClick={onAdd}
    >
      <span aria-hidden="true">+</span>
      New lane
    </Button>
  </div>;
}
