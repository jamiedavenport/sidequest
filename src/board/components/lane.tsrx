// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { Ellipsis, Plus } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
} from "react";

import { cn } from "@/lib/utils";

import { useLaneChrome } from "~/board/components/lane-chrome.tsrx";
import { LaneSymbol } from "~/board/components/lane/symbol.tsrx";
import { QuickAdd } from "~/board/components/quick-add.tsrx";
import {
  addLaneHotkeys,
  moveLaneLeftHotkeys,
  moveLaneRightHotkeys,
  removeLaneHotkeys,
  renameLaneHotkeys,
  ShortcutKeys,
} from "~/board/components/shortcut-keys.tsrx";
import { TaskRow } from "~/board/components/task-row.tsrx";
import { addLane, moveLane, requestRemoveLane, updateLane } from "~/board/data/mutations";
import { currentLaneId } from "~/board/navigation/commands";
import { BoardActor } from "~/board/navigation/machine";
import { useBoardClient } from "~/board/sync/client";
import type { BoardLane } from "~/board/types";
import { isSystemLane, planLaneMove } from "~/board/views";
import { Button } from "~/components/ui/button.tsrx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu.tsrx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty.tsrx";
import { Input } from "~/components/ui/input.tsrx";

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

function LaneTitle({ lane }: { lane: BoardLane }) @{
  const client = useBoardClient();
  const { editingLaneId, stopRename } = useLaneChrome();
  const editing = editingLaneId === lane.id;
  const [draft, setDraft] = useState(lane.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

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
    if (cancelledRef.current) {
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
    <StartAddButton className="flex min-w-0 flex-1 items-center gap-2.5" lane={lane}>
      <h2
        className="truncate text-lg font-semibold tracking-tight sm:text-sm"
        id={`${lane.id}-title`}
      >
        {lane.title}
      </h2>
      <span className="tabular-nums text-sm text-muted-foreground sm:text-xs">
        {lane.tasks.length}
      </span>
    </StartAddButton>;
  }
}

function LaneOptions({ lane }: { lane: BoardLane }) @{
  const client = useBoardClient();
  const { startRename, startRemove } = useLaneChrome();
  const canMoveLeft = planLaneMove(client.lanes.toArray, lane.id, "left") !== undefined;
  const canMoveRight = planLaneMove(client.lanes.toArray, lane.id, "right") !== undefined;

  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button size="icon" type="button" variant="ghost" aria-label={`${lane.title} options`} />
      }
    >
      <Ellipsis aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-48">
      <DropdownMenuItem onClick={() => startRename(lane.id)}>
        Rename
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={renameLaneHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!canMoveLeft}
        onClick={() => {
          moveLane(client, lane.id, "left");
        }}
      >
        Move left
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={moveLaneLeftHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!canMoveRight}
        onClick={() => {
          moveLane(client, lane.id, "right");
        }}
      >
        Move right
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={moveLaneRightHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={() => requestRemoveLane(client, lane.id, startRemove)}
      >
        Remove lane
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={removeLaneHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function TaskLane({ lane }: { lane: BoardLane }) @{
  const selected = BoardActor.useSelector(
    (snapshot) => currentLaneId(snapshot.context) === lane.id,
  );
  const selectedId = BoardActor.useSelector((snapshot) => snapshot.context.selectedId);
  const focusedWithoutTask =
    selected && (selectedId === null || !lane.tasks.some((task) => task.id === selectedId));
  const articleRef = useRef<HTMLElement>(null);
  const system = isSystemLane(lane);

  useEffect(() => {
    if (focusedWithoutTask) {
      articleRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [focusedWithoutTask]);

  <article
    ref={articleRef}
    className={cn(
      "flex h-full w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-y-auto border-t-2 border-r border-border bg-white px-2 py-5 sm:w-87 sm:px-3 sm:py-4.5",
      selected ? "border-t-primary" : "border-t-transparent",
    )}
    aria-current={selected ? "true" : undefined}
    aria-labelledby={`${lane.id}-title`}
  >
    <div className="flex min-w-0 items-center justify-between gap-3 px-2 sm:px-1">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <StartAddButton className="shrink-0" lane={lane}>
          <LaneSymbol colour={lane.colour} shape={lane.shape} />
        </StartAddButton>
        <LaneTitle lane={lane} />
      </div>
      @if (!system) {
        <LaneOptions lane={lane} />;
      }
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
  const { startRename } = useLaneChrome();

  function onAdd() {
    const laneId = addLane(client);
    actorRef.send({ type: "lane.select", laneId });
    startRename(laneId);
  }

  <button
    className="flex h-full w-[calc(100vw-1.5rem)] shrink-0 flex-col border-t-2 border-transparent p-2 text-left outline-none hover:bg-muted/25 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:w-87 sm:p-3 cursor-pointer transition-colors"
    type="button"
    aria-label="New lane"
    onClick={onAdd}
  >
    <Empty className="h-full min-h-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Plus aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-lg sm:text-sm">New lane</EmptyTitle>
        <EmptyDescription className="text-pretty text-sm/5 sm:text-xs/4">
          Create a lane for a project or area of work.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="hidden sm:flex">
        <ShortcutKeys hotkeys={addLaneHotkeys} />
      </EmptyContent>
    </Empty>
  </button>;
}
