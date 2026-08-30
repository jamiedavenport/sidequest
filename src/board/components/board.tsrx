import { useHotkey } from "@tanstack/react-hotkeys";
import { useEffect, useRef } from "react";

import { currentLaneId } from "~/board/commands";
import { BoardActor } from "~/board/machine";
import { ShortcutFooter } from "~/board/components/footer.tsrx";
import { AppHeader } from "~/board/components/header.tsrx";
import { AddLaneButton, TaskLane } from "~/board/components/lane.tsrx";

function useHotkeys() {
  const actorRef = BoardActor.useActorRef();
  const adding = BoardActor.useSelector((snapshot) => snapshot.value === "adding");

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
      actorRef.send({ type: "lane.focus", kind: "inbox" });
    },
    { ignoreInputs: true, meta: { name: "Go to Inbox" } },
  );
  useHotkey(
    "T",
    () => {
      actorRef.send({ type: "lane.focus", kind: "today" });
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
      actorRef.send({ type: "task.move", direction: "up" });
    },
    { ignoreInputs: true, meta: { name: "Move up" } },
  );
  useHotkey(
    "Mod+Shift+ArrowDown",
    () => {
      actorRef.send({ type: "task.move", direction: "down" });
    },
    { ignoreInputs: true, meta: { name: "Move down" } },
  );
  useHotkey(
    "Mod+Shift+ArrowLeft",
    () => {
      actorRef.send({ type: "lane.move", direction: "left" });
    },
    { ignoreInputs: true, meta: { name: "Move lane left" } },
  );
  useHotkey(
    "Mod+Shift+ArrowRight",
    () => {
      actorRef.send({ type: "lane.move", direction: "right" });
    },
    { ignoreInputs: true, meta: { name: "Move lane right" } },
  );
}

function TaskBoardContent() @{
  const lanes = BoardActor.useSelector((snapshot) => snapshot.context.lanes);
  const mode = BoardActor.useSelector((snapshot) => snapshot.value);
  const listboxRef = useRef<HTMLDivElement>(null);
  const wasAdding = useRef(false);

  useHotkeys();

  useEffect(() => {
    if (wasAdding.current && mode === "navigating") {
      listboxRef.current?.focus({ preventScroll: true });
    }

    wasAdding.current = mode === "adding";
  }, [mode]);

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
  </main>;
}

export function TaskBoard() @{
  <BoardActor.Provider>
    <TaskBoardContent />
  </BoardActor.Provider>;
}
