// oxlint-disable jsx-a11y/no-redundant-roles, react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useBoardDrag, useLaneDrag, laneDragId } from "~/board/components/board-drag.tsrx";
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
import { useBoardStore, useBoardSelector } from "~/board/navigation/provider.tsrx";
import { BoardEvent, currentLaneId, selectedTaskId } from "~/board/navigation/model";
import { useBoardClient } from "~/board/sync/client";
import type { BoardLane } from "~/board/types";
import { activeTaskCountForView, isSystemLane, planLaneMove } from "~/board/views";
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
import { GitHubIcon } from "~/github/icon.tsrx";

function StartAddButton({
  lane,
  className,
  ...props
}: ComponentProps<"button"> & { lane: BoardLane }) @{
  const store = useBoardStore();

  function onStartAdd(event: { button: number; preventDefault: () => void }) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    store.send(BoardEvent.AddStart({ viewId: lane.id }));
  }

  <button
    className={cn("text-left", className)}
    type="button"
    aria-label={`Add a task to ${lane.title}`}
    {...props}
    onClick={onStartAdd}
  />;
}

function LaneTitle({ lane }: { lane: BoardLane }) @{
  const client = useBoardClient();
  const { editingLaneId, stopRename } = useLaneChrome();
  const editing = editingLaneId === lane.id;
  const [draft, setDraft] = useState(lane.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const taskCount = activeTaskCountForView(client.tasks.toArray, lane.id);

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
    <StartAddButton
      data-lane-drag-surface=""
      className="flex min-w-0 flex-1 items-center gap-2.5"
      lane={lane}
    >
      <h2
        className="truncate text-lg font-semibold tracking-tight sm:text-sm"
        id={`${lane.id}-title`}
      >
        {lane.title}
      </h2>
      <span className="tabular-nums text-sm text-muted-foreground sm:text-xs">{taskCount}</span>
    </StartAddButton>;
  }
}

function LaneOptions({ lane }: { lane: BoardLane }) @{
  const client = useBoardClient();
  const store = useBoardStore();
  const { startRename, startRemove, openGithubSettings } = useLaneChrome();
  const { runMove } = useBoardDrag();
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
      <DropdownMenuItem
        onClick={() => {
          store.send(BoardEvent.EditCancel({}));
          startRename(lane.id);
        }}
      >
        Rename
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={renameLaneHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!canMoveLeft}
        onClick={() => {
          store.send(BoardEvent.EditCancel({}));
          runMove(moveLane(client, lane.id, "left"));
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
          store.send(BoardEvent.EditCancel({}));
          runMove(moveLane(client, lane.id, "right"));
        }}
      >
        Move right
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={moveLaneRightHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => openGithubSettings(lane.id)}>
        <GitHubIcon />
        GitHub
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={() => {
          store.send(BoardEvent.EditCancel({}));
          requestRemoveLane(client, lane.id, startRemove);
        }}
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
  const { githubConnections, openGithubSettings } = useLaneChrome();
  const githubConnection = githubConnections.find((connection) => connection.laneId === lane.id);
  const selected = useBoardSelector((snapshot) => currentLaneId(snapshot) === lane.id);
  const taskIdSelected = useBoardSelector(selectedTaskId);
  const editingTask = useBoardSelector((snapshot) => snapshot.interaction._tag === "Editing");
  const quickAddActive = selected && !editingTask;
  const focusedWithoutTask =
    selected && (taskIdSelected === null || !lane.tasks.some((task) => task.id === taskIdSelected));
  const articleRef = useRef<HTMLElement>(null);
  const system = isSystemLane(lane);
  const headerRef = useRef<HTMLDivElement>(null);
  const dropEdge = useLaneDrag(lane.id, articleRef, headerRef);

  useEffect(() => {
    if (focusedWithoutTask) {
      articleRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [focusedWithoutTask]);

  <article
    ref={articleRef}
    data-board-drop={laneDragId(lane.id)}
    data-lane-drop=""
    data-drop-edge={dropEdge}
    className={cn(
      "flex h-full w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-hidden border-t-2 border-r border-border bg-white px-2 py-5 sm:w-87 sm:px-3 sm:py-4.5",
      selected ? "border-t-primary" : "border-t-transparent",
      dropEdge === "append" && "bg-primary/5 ring-2 ring-primary/40 ring-inset",
      dropEdge === "before" && "border-l-2 border-l-primary",
      dropEdge === "after" && "border-r-2 border-r-primary",
    )}
    aria-current={selected ? "true" : undefined}
    aria-labelledby={`${lane.id}-title`}
  >
    <div ref={headerRef} className="flex min-w-0 items-center justify-between gap-3 px-2 sm:px-1">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <StartAddButton className="shrink-0" lane={lane}>
          <LaneSymbol colour={lane.colour} shape={lane.shape} />
        </StartAddButton>
        <LaneTitle lane={lane} />
      </div>
      @if (!system) {
        <div className="flex shrink-0 items-center gap-1">
          @if (githubConnection) {
            <Button
              size="icon"
              variant="ghost"
              className="text-muted-foreground"
              aria-label={`${lane.title} GitHub settings (${githubConnection.repository})`}
              title={`Connected to ${githubConnection.repository} on GitHub`}
              onClick={() => openGithubSettings(lane.id)}
            >
              <GitHubIcon />
            </Button>;
          }
          <LaneOptions lane={lane} />
        </div>;
      }
    </div>
    <div className="flex min-h-0 flex-1 flex-col pt-4 sm:pt-3.5">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 sm:pb-1.5">
        <ul className="flex flex-col gap-0.5" role="list">
          @for (const task of lane.tasks; key task.id) {
            <TaskRow laneId={lane.id} task={task} />;
          }
        </ul>
        <StartAddButton className="min-h-0 w-full flex-1" lane={lane} />
      </div>
      <div className="relative shrink-0">
        <div
          className={cn(
            "origin-bottom transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            quickAddActive
              ? "scale-100 opacity-100"
              : "pointer-events-none absolute inset-x-0 bottom-0 scale-90 opacity-0 motion-reduce:scale-100",
          )}
          aria-hidden={quickAddActive ? undefined : true}
          inert={quickAddActive ? undefined : true}
        >
          <QuickAdd lane={lane} />
        </div>
        @if (!quickAddActive) {
          <StartAddButton className="absolute inset-0" lane={lane} />;
        }
      </div>
    </div>
  </article>;
}

export function AddLaneButton() @{
  const client = useBoardClient();
  const store = useBoardStore();
  const { startRename } = useLaneChrome();

  function onAdd() {
    store.send(BoardEvent.EditCancel({}));
    const laneId = addLane(client);
    store.send(BoardEvent.LaneSelect({ viewId: laneId }));
    startRename(laneId);
  }

  <button
    className="flex h-full w-[calc(100vw-1.5rem)] shrink-0 cursor-pointer flex-col border-t-2 border-transparent p-2 text-left outline-none hover:bg-muted/25 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 sm:w-87 sm:p-3"
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
