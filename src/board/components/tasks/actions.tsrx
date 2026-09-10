// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { Effect } from "effect";
import { ChevronDown, ChevronRight, Ellipsis } from "lucide-react";
import { useBoardClient } from "~/board/sync/client.tsrx";
import { useBoardStore } from "~/board/navigation/provider.tsrx";
import { BoardEvent } from "~/board/navigation/model";
import { completeTask, setTaskCollapsed } from "~/board/data/mutations";
import {
  collapseHotkeys,
  editHotkeys,
  notesHotkeys,
  ShortcutKeys,
  whiteboardHotkeys,
} from "~/board/components/shortcut-keys.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu.tsrx";
import type { BoardTask, Task } from "~/board/types";

export function CompleteTaskButton({ task }: { task: Task }) @{
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

export function SelectTaskButton({ laneId, task }: { laneId: string; task: Task }) @{
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

export function TaskDisclosure({
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

export function TaskOptions({
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
