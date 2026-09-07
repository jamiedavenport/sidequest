import { GitHubDialog } from "~/github/dialog.tsrx";
import { BoardDragProvider, useBoardDrag } from "~/board/components/board-drag.tsrx";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Effect } from "effect";
import { useEffect, useRef } from "react";

import { SyncClientProvider, useBoardClient } from "~/board/sync/client";
import { BoardProvider, useBoardStore, useBoardSelector } from "~/board/navigation/provider.tsrx";
import {
  BoardEvent,
  currentLaneId,
  selectedTarget,
  selectedTaskId,
} from "~/board/navigation/model";
import {
  addLane,
  completeTask,
  moveLane,
  moveTaskInLane,
  moveTaskToLane,
  nestTask,
  requestRemoveLane,
  setTaskCollapsed,
} from "~/board/data/mutations";
import { useBoardLanes } from "~/board/data/queries";
import { hasActiveTaskChildren, inboxLaneId, isSystemLane, todayLaneId } from "~/board/views";
import { BoardBooting } from "~/board/components/booting.tsrx";
import { ShortcutFooter } from "~/board/components/footer.tsrx";
import { AppHeader } from "~/board/components/header.tsrx";
import { DetailSheet } from "~/board/components/detail-sheet.tsrx";
import { LaneChromeProvider, useLaneChrome } from "~/board/components/lane-chrome.tsrx";
import { AddLaneButton, TaskLane } from "~/board/components/lane.tsrx";
import { LaneRemoveDialog } from "~/board/components/lane-remove-dialog.tsrx";
import {
  collapseHotkey,
  completeHotkey,
  editHotkey,
  notesHotkey,
  whiteboardHotkey,
} from "~/board/components/shortcut-keys.tsrx";
import type { BoardLane } from "~/board/types";

function useBoardHotkeys() {
  const store = useBoardStore();
  const client = useBoardClient();
  const { editingLaneId, removingLaneId, githubLaneId, startRename, startRemove } = useLaneChrome();
  const mode = useBoardSelector((snapshot) => snapshot.interaction._tag);
  const taskIdSelected = useBoardSelector(selectedTaskId);
  const { runMove } = useBoardDrag();
  const navigating = mode === "Navigating" && githubLaneId === null;
  const laneCommandsEnabled = navigating && editingLaneId === null && removingLaneId === null;
  const taskEditEnabled = laneCommandsEnabled && taskIdSelected !== null;

  useHotkey(
    "ArrowUp",
    () => {
      store.send(BoardEvent.Navigate({ direction: "up" }));
    },
    { enabled: navigating, meta: { name: "Navigate up" } },
  );
  useHotkey(
    "ArrowDown",
    () => {
      store.send(BoardEvent.Navigate({ direction: "down" }));
    },
    { enabled: navigating, meta: { name: "Navigate down" } },
  );
  useHotkey(
    "ArrowLeft",
    () => {
      store.send(BoardEvent.Navigate({ direction: "left" }));
    },
    { enabled: navigating, meta: { name: "Navigate left" } },
  );
  useHotkey(
    "ArrowRight",
    () => {
      store.send(BoardEvent.Navigate({ direction: "right" }));
    },
    { enabled: navigating, meta: { name: "Navigate right" } },
  );
  useHotkey(
    "I",
    () => {
      store.send(BoardEvent.LaneSelect({ viewId: inboxLaneId }));
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Go to Inbox" } },
  );
  useHotkey(
    "T",
    () => {
      store.send(BoardEvent.LaneSelect({ viewId: todayLaneId }));
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Go to Today" } },
  );
  useHotkey(
    "C",
    () => {
      store.send(BoardEvent.AddStart({ viewId: currentLaneId(store.getSnapshot()) }));
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Create" } },
  );
  useHotkey(
    notesHotkey,
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        store.send(BoardEvent.DetailsOpen({ target, tab: "notes" }));
      }
    },
    { enabled: taskEditEnabled, ignoreInputs: true, meta: { name: "Open notes" } },
  );
  useHotkey(
    whiteboardHotkey,
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        store.send(BoardEvent.DetailsOpen({ target, tab: "whiteboard" }));
      }
    },
    { enabled: taskEditEnabled, ignoreInputs: true, meta: { name: "Open whiteboard" } },
  );
  useHotkey(
    editHotkey,
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        store.send(BoardEvent.EditStart({ target }));
      }
    },
    { enabled: taskEditEnabled, ignoreInputs: true, meta: { name: "Edit task" } },
  );
  useHotkey(
    "Mod+Shift+ArrowUp",
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        runMove(moveTaskInLane(client, target.taskId, "up", target.viewId));
      }
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Move up" } },
  );
  useHotkey(
    "Mod+Shift+ArrowDown",
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        runMove(moveTaskInLane(client, target.taskId, "down", target.viewId));
      }
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Move down" } },
  );
  useHotkey(
    "Mod+Shift+ArrowLeft",
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        const taskId = target.taskId;
        runMove(moveTaskToLane(client, taskId, "left", target.viewId), (result) => {
          if (result !== undefined) {
            store.send(BoardEvent.TaskSelect({ target: { viewId: result.viewId, taskId } }));
          }
        });
      }
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Move across left" } },
  );
  useHotkey(
    "Mod+Shift+ArrowRight",
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        const taskId = target.taskId;
        runMove(moveTaskToLane(client, taskId, "right", target.viewId), (result) => {
          if (result !== undefined) {
            store.send(BoardEvent.TaskSelect({ target: { viewId: result.viewId, taskId } }));
          }
        });
      }
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Move across right" } },
  );
  useHotkey(
    "L",
    () => {
      const laneId = addLane(client);
      store.send(BoardEvent.LaneSelect({ viewId: laneId }));
      startRename(laneId);
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "New lane" } },
  );
  useHotkey(
    "R",
    () => {
      const laneId = currentLaneId(store.getSnapshot());
      if (!isSystemLane({ id: laneId })) {
        startRename(laneId);
      }
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Rename lane" } },
  );
  useHotkey(
    "Mod+Alt+ArrowLeft",
    () => {
      runMove(moveLane(client, currentLaneId(store.getSnapshot()), "left"));
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Move lane left" } },
  );
  useHotkey(
    "Mod+Alt+ArrowRight",
    () => {
      runMove(moveLane(client, currentLaneId(store.getSnapshot()), "right"));
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Move lane right" } },
  );
  useHotkey(
    "Mod+Backspace",
    () => {
      requestRemoveLane(client, currentLaneId(store.getSnapshot()), startRemove);
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Remove lane" } },
  );
  useHotkey(
    completeHotkey,
    () => {
      const taskId = selectedTaskId(store.getSnapshot());
      if (taskId !== null) {
        completeTask(client, taskId);
      }
    },
    { ignoreInputs: true, enabled: navigating, meta: { name: "Complete" } },
  );
  useHotkey(
    "Tab",
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        runMove(nestTask(client, target.taskId, 1, target.viewId));
      }
    },
    { ignoreInputs: true, enabled: navigating, meta: { name: "Nest" } },
  );
  useHotkey(
    "Shift+Tab",
    () => {
      const target = selectedTarget(store.getSnapshot());
      if (target !== undefined) {
        runMove(nestTask(client, target.taskId, -1, target.viewId));
      }
    },
    { ignoreInputs: true, enabled: navigating, meta: { name: "Unnest" } },
  );
  useHotkey(
    collapseHotkey,
    () => {
      const target = selectedTarget(store.getSnapshot());
      const task = target === undefined ? undefined : client.tasks.get(target.taskId);
      if (task !== undefined && hasActiveTaskChildren(client.tasks.toArray, task.id)) {
        void Effect.runPromise(setTaskCollapsed(client, task.id, !task.collapsed)).catch(
          (error: unknown) => {
            console.error("Failed to toggle task subtree", error);
          },
        );
      }
    },
    { ignoreInputs: true, enabled: taskEditEnabled, meta: { name: "Toggle subtree" } },
  );
}

function BoardCanvas({ lanes }: { lanes: ReadonlyArray<BoardLane> }) @{
  const mode = useBoardSelector((snapshot) => snapshot.interaction._tag);
  const listboxRef = useRef<HTMLDivElement>(null);
  const wasAdding = useRef(false);

  useBoardHotkeys();

  useEffect(() => {
    if (wasAdding.current && mode === "Navigating") {
      listboxRef.current?.focus({ preventScroll: true });
    }

    wasAdding.current = mode === "Adding";
  }, [mode]);

  <>
    <main className="isolate grid h-dvh min-w-80 grid-cols-1 grid-rows-[3.5rem_minmax(0,1fr)] overflow-hidden bg-background sm:grid-rows-[3.375rem_minmax(0,1fr)_2.375rem]">
      <h1 className="sr-only">Sidequest task board</h1>
      <AppHeader />
      <section className="min-h-0 min-w-0 overflow-hidden" aria-label="Task lanes">
        <div
          ref={listboxRef}
          data-board-focus=""
          className="flex h-full min-w-0 gap-3 overflow-x-auto overflow-y-hidden px-3 pb-4 sm:gap-0 sm:px-0 sm:pb-0"
          tabIndex={-1}
        >
          @for (const lane of lanes; key lane.id) {
            <TaskLane lane={lane} />;
          }
          <AddLaneButton />
        </div>
      </section>
      <ShortcutFooter />
    </main>
    <LaneRemoveDialog lanes={lanes} />
    <GitHubDialog lanes={lanes} />
    <DetailSheet />
  </>;
}

function BoardShell({ lanes }: { lanes: ReadonlyArray<BoardLane> }) @{
  <LaneChromeProvider>
    <BoardDragProvider>
      <BoardCanvas lanes={lanes} />
    </BoardDragProvider>
  </LaneChromeProvider>;
}

function SyncedBoard() @{
  const client = useBoardClient();
  const store = useBoardStore();
  const { isReady, lanes, tasks } = useBoardLanes(client);

  useEffect(() => {
    if (isReady) {
      store.send(BoardEvent.BoardSync({ lanes, tasks }));
    }
  }, [store, isReady, lanes, tasks]);

  @if (!isReady) {
    <BoardBooting />;
  } @else {
    <BoardShell lanes={lanes} />;
  }
}

export function TaskBoard() @{
  <BoardProvider>
    <SyncClientProvider>
      <SyncedBoard />
    </SyncClientProvider>
  </BoardProvider>;
}
