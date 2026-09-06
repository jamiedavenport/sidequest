import { BoardDragProvider, useBoardDrag } from "~/board/components/board-drag.tsrx";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Effect } from "effect";
import { useEffect, useRef } from "react";

import { currentLaneId } from "~/board/navigation/commands";
import { SyncClientProvider, useBoardClient } from "~/board/sync/client";
import { BoardActor } from "~/board/navigation/machine";
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
  editHotkey,
  notesHotkey,
  whiteboardHotkey,
} from "~/board/components/shortcut-keys.tsrx";
import type { BoardLane } from "~/board/types";

function useBoardHotkeys() {
  const actorRef = BoardActor.useActorRef();
  const client = useBoardClient();
  const { editingLaneId, removingLaneId, startRename, startRemove } = useLaneChrome();
  const mode = BoardActor.useSelector((snapshot) => snapshot.value);
  const selectedTaskId = BoardActor.useSelector((snapshot) => snapshot.context.cursor.taskId);
  const { runMove } = useBoardDrag();
  const navigating = mode === "navigating";
  const laneCommandsEnabled = navigating && editingLaneId === null && removingLaneId === null;
  const taskEditEnabled = laneCommandsEnabled && selectedTaskId !== null;

  useHotkey(
    "ArrowUp",
    () => {
      actorRef.send({ type: "navigate", direction: "up" });
    },
    { enabled: navigating, meta: { name: "Navigate up" } },
  );
  useHotkey(
    "ArrowDown",
    () => {
      actorRef.send({ type: "navigate", direction: "down" });
    },
    { enabled: navigating, meta: { name: "Navigate down" } },
  );
  useHotkey(
    "ArrowLeft",
    () => {
      actorRef.send({ type: "navigate", direction: "left" });
    },
    { enabled: navigating, meta: { name: "Navigate left" } },
  );
  useHotkey(
    "ArrowRight",
    () => {
      actorRef.send({ type: "navigate", direction: "right" });
    },
    { enabled: navigating, meta: { name: "Navigate right" } },
  );
  useHotkey(
    "I",
    () => {
      actorRef.send({ type: "lane.select", laneId: inboxLaneId });
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Go to Inbox" } },
  );
  useHotkey(
    "T",
    () => {
      actorRef.send({ type: "lane.select", laneId: todayLaneId });
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Go to Today" } },
  );
  useHotkey(
    "C",
    () => {
      actorRef.send({ type: "add.start", laneId: currentLaneId(actorRef.getSnapshot().context) });
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Create" } },
  );
  useHotkey(
    notesHotkey,
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        actorRef.send({
          type: "details.open",
          taskId: cursor.taskId,
          laneId: cursor.laneId,
          tab: "notes",
        });
      }
    },
    { enabled: taskEditEnabled, ignoreInputs: true, meta: { name: "Open notes" } },
  );
  useHotkey(
    whiteboardHotkey,
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        actorRef.send({
          type: "details.open",
          taskId: cursor.taskId,
          laneId: cursor.laneId,
          tab: "whiteboard",
        });
      }
    },
    { enabled: taskEditEnabled, ignoreInputs: true, meta: { name: "Open whiteboard" } },
  );
  useHotkey(
    editHotkey,
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        actorRef.send({ type: "edit.start", taskId: cursor.taskId, laneId: cursor.laneId });
      }
    },
    { enabled: taskEditEnabled, ignoreInputs: true, meta: { name: "Edit task" } },
  );
  useHotkey(
    "Mod+Shift+ArrowUp",
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        runMove(moveTaskInLane(client, cursor.taskId, "up", cursor.laneId));
      }
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Move up" } },
  );
  useHotkey(
    "Mod+Shift+ArrowDown",
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        runMove(moveTaskInLane(client, cursor.taskId, "down", cursor.laneId));
      }
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Move down" } },
  );
  useHotkey(
    "Mod+Shift+ArrowLeft",
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        const taskId = cursor.taskId;
        runMove(moveTaskToLane(client, taskId, "left", cursor.laneId), (result) => {
          if (result !== undefined)
            actorRef.send({ type: "task.select", taskId, laneId: result.viewId });
        });
      }
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Move across left" } },
  );
  useHotkey(
    "Mod+Shift+ArrowRight",
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        const taskId = cursor.taskId;
        runMove(moveTaskToLane(client, taskId, "right", cursor.laneId), (result) => {
          if (result !== undefined)
            actorRef.send({ type: "task.select", taskId, laneId: result.viewId });
        });
      }
    },
    { enabled: navigating, ignoreInputs: true, meta: { name: "Move across right" } },
  );
  useHotkey(
    "L",
    () => {
      const laneId = addLane(client);
      actorRef.send({ type: "lane.select", laneId });
      startRename(laneId);
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "New lane" } },
  );
  useHotkey(
    "R",
    () => {
      const laneId = currentLaneId(actorRef.getSnapshot().context);
      if (!isSystemLane({ id: laneId })) {
        startRename(laneId);
      }
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Rename lane" } },
  );
  useHotkey(
    "Mod+Alt+ArrowLeft",
    () => {
      runMove(moveLane(client, currentLaneId(actorRef.getSnapshot().context), "left"));
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Move lane left" } },
  );
  useHotkey(
    "Mod+Alt+ArrowRight",
    () => {
      runMove(moveLane(client, currentLaneId(actorRef.getSnapshot().context), "right"));
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Move lane right" } },
  );
  useHotkey(
    "Mod+Backspace",
    () => {
      requestRemoveLane(client, currentLaneId(actorRef.getSnapshot().context), startRemove);
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Remove lane" } },
  );
  useHotkey(
    "Mod+Enter",
    () => {
      const taskId = actorRef.getSnapshot().context.cursor.taskId;
      if (taskId !== null) {
        completeTask(client, taskId);
      }
    },
    { ignoreInputs: true, enabled: navigating, meta: { name: "Complete" } },
  );
  useHotkey(
    "Tab",
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        runMove(nestTask(client, cursor.taskId, 1, cursor.laneId));
      }
    },
    { ignoreInputs: true, enabled: navigating, meta: { name: "Nest" } },
  );
  useHotkey(
    "Shift+Tab",
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      if (cursor.taskId !== null) {
        runMove(nestTask(client, cursor.taskId, -1, cursor.laneId));
      }
    },
    { ignoreInputs: true, enabled: navigating, meta: { name: "Unnest" } },
  );
  useHotkey(
    collapseHotkey,
    () => {
      const { cursor } = actorRef.getSnapshot().context;
      const task = cursor.taskId === null ? undefined : client.tasks.get(cursor.taskId);
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
  const mode = BoardActor.useSelector((snapshot) => snapshot.value);
  const listboxRef = useRef<HTMLDivElement>(null);
  const wasAdding = useRef(false);

  useBoardHotkeys();

  useEffect(() => {
    if (wasAdding.current && mode === "navigating") {
      listboxRef.current?.focus({ preventScroll: true });
    }

    wasAdding.current = mode === "adding";
  }, [mode]);

  <>
    <main className="isolate grid h-dvh min-w-80 grid-rows-[3.5rem_minmax(0,1fr)] overflow-hidden bg-background sm:grid-rows-[3.375rem_minmax(0,1fr)_2.375rem]">
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
  const actorRef = BoardActor.useActorRef();
  const { isReady, lanes } = useBoardLanes(client);

  useEffect(() => {
    if (isReady) {
      actorRef.send({ type: "board.sync", lanes });
    }
  }, [actorRef, isReady, lanes]);

  @if (!isReady) {
    <BoardBooting />;
  } @else {
    <BoardShell lanes={lanes} />;
  }
}

export function TaskBoard() @{
  <BoardActor.Provider>
    <SyncClientProvider>
      <SyncedBoard />
    </SyncClientProvider>
  </BoardActor.Provider>;
}
