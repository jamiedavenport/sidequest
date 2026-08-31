import { useHotkey } from "@tanstack/react-hotkeys";
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
} from "~/board/data/mutations";
import { useBoardLanes } from "~/board/data/queries";
import { inboxLaneId, isSystemLane, todayLaneId } from "~/board/views";
import { BoardBooting } from "~/board/components/booting.tsrx";
import { ShortcutFooter } from "~/board/components/footer.tsrx";
import { AppHeader } from "~/board/components/header.tsrx";
import { LaneChromeProvider, useLaneChrome } from "~/board/components/lane-chrome.tsrx";
import { AddLaneButton, TaskLane } from "~/board/components/lane.tsrx";
import { LaneRemoveDialog } from "~/board/components/lane-remove-dialog.tsrx";
import type { BoardLane } from "~/board/types";

function useBoardHotkeys() {
  const actorRef = BoardActor.useActorRef();
  const client = useBoardClient();
  const { editingLaneId, removingLaneId, startRename, startRemove } = useLaneChrome();
  const adding = BoardActor.useSelector((snapshot) => snapshot.value === "adding");
  const laneCommandsEnabled = !adding && editingLaneId === null && removingLaneId === null;

  useHotkey(
    "ArrowUp",
    () => {
      actorRef.send({ type: "navigate", direction: "up" });
    },
    { enabled: !adding, meta: { name: "Navigate up" } },
  );
  useHotkey(
    "ArrowDown",
    () => {
      actorRef.send({ type: "navigate", direction: "down" });
    },
    { enabled: !adding, meta: { name: "Navigate down" } },
  );
  useHotkey(
    "ArrowLeft",
    () => {
      actorRef.send({ type: "navigate", direction: "left" });
    },
    { enabled: !adding, meta: { name: "Navigate left" } },
  );
  useHotkey(
    "ArrowRight",
    () => {
      actorRef.send({ type: "navigate", direction: "right" });
    },
    { enabled: !adding, meta: { name: "Navigate right" } },
  );
  useHotkey(
    "I",
    () => {
      actorRef.send({ type: "lane.select", laneId: inboxLaneId });
    },
    { ignoreInputs: true, meta: { name: "Go to Inbox" } },
  );
  useHotkey(
    "T",
    () => {
      actorRef.send({ type: "lane.select", laneId: todayLaneId });
    },
    { ignoreInputs: true, meta: { name: "Go to Today" } },
  );
  useHotkey(
    "C",
    () => {
      const laneId = currentLaneId(actorRef.getSnapshot().context);
      if (laneId !== null) {
        actorRef.send({ type: "add.start", laneId });
      }
    },
    { ignoreInputs: true, meta: { name: "Create" } },
  );
  useHotkey(
    "Mod+Shift+ArrowUp",
    () => {
      const snapshot = actorRef.getSnapshot();
      const taskId = snapshot.context.selectedId;
      if (taskId !== null) {
        moveTaskInLane(client, taskId, "up", snapshot.context.selectedLaneId);
      }
    },
    { ignoreInputs: true, meta: { name: "Move up" } },
  );
  useHotkey(
    "Mod+Shift+ArrowDown",
    () => {
      const snapshot = actorRef.getSnapshot();
      const taskId = snapshot.context.selectedId;
      if (taskId !== null) {
        moveTaskInLane(client, taskId, "down", snapshot.context.selectedLaneId);
      }
    },
    { ignoreInputs: true, meta: { name: "Move down" } },
  );
  useHotkey(
    "Mod+Shift+ArrowLeft",
    () => {
      const snapshot = actorRef.getSnapshot();
      const taskId = snapshot.context.selectedId;
      if (taskId !== null) {
        const laneId = moveTaskToLane(client, taskId, "left", snapshot.context.selectedLaneId);
        if (laneId !== undefined) {
          actorRef.send({ type: "task.select", taskId, laneId });
        }
      }
    },
    { ignoreInputs: true, meta: { name: "Move across left" } },
  );
  useHotkey(
    "Mod+Shift+ArrowRight",
    () => {
      const snapshot = actorRef.getSnapshot();
      const taskId = snapshot.context.selectedId;
      if (taskId !== null) {
        const laneId = moveTaskToLane(client, taskId, "right", snapshot.context.selectedLaneId);
        if (laneId !== undefined) {
          actorRef.send({ type: "task.select", taskId, laneId });
        }
      }
    },
    { ignoreInputs: true, meta: { name: "Move across right" } },
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
      if (laneId !== null && !isSystemLane({ id: laneId })) {
        startRename(laneId);
      }
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Rename lane" } },
  );
  useHotkey(
    "Mod+Alt+ArrowLeft",
    () => {
      const laneId = currentLaneId(actorRef.getSnapshot().context);
      if (laneId !== null) {
        moveLane(client, laneId, "left");
      }
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Move lane left" } },
  );
  useHotkey(
    "Mod+Alt+ArrowRight",
    () => {
      const laneId = currentLaneId(actorRef.getSnapshot().context);
      if (laneId !== null) {
        moveLane(client, laneId, "right");
      }
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Move lane right" } },
  );
  useHotkey(
    "Mod+Backspace",
    () => {
      const laneId = currentLaneId(actorRef.getSnapshot().context);
      if (laneId !== null) {
        requestRemoveLane(client, laneId, startRemove);
      }
    },
    { enabled: laneCommandsEnabled, ignoreInputs: true, meta: { name: "Remove lane" } },
  );
  useHotkey(
    "Mod+Enter",
    () => {
      const taskId = actorRef.getSnapshot().context.selectedId;
      if (taskId !== null) {
        completeTask(client, taskId);
      }
    },
    { ignoreInputs: true, enabled: !adding, meta: { name: "Complete" } },
  );
  useHotkey(
    "Tab",
    () => {
      const snapshot = actorRef.getSnapshot();
      const taskId = snapshot.context.selectedId;
      if (taskId !== null) {
        nestTask(client, taskId, 1, snapshot.context.selectedLaneId);
      }
    },
    { ignoreInputs: true, enabled: !adding, meta: { name: "Nest" } },
  );
  useHotkey(
    "Shift+Tab",
    () => {
      const snapshot = actorRef.getSnapshot();
      const taskId = snapshot.context.selectedId;
      if (taskId !== null) {
        nestTask(client, taskId, -1, snapshot.context.selectedLaneId);
      }
    },
    { ignoreInputs: true, enabled: !adding, meta: { name: "Unnest" } },
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
  </>;
}

function BoardShell({ lanes }: { lanes: ReadonlyArray<BoardLane> }) @{
  <LaneChromeProvider>
    <BoardCanvas lanes={lanes} />
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
