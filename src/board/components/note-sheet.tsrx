// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useEffect, useMemo, useRef, useState } from "react";

import { NoteEditor, type NoteSaveStatus } from "~/board/components/note-editor.tsrx";
import { BoardActor } from "~/board/navigation/machine";
import type { BoardTask } from "~/board/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet.tsrx";

type OpenNoteTask = {
  laneId: string;
  task: BoardTask;
};

function NoteSaveStatusLabel({ status }: { status: NoteSaveStatus }) @{
  const label =
    status === "dirty"
      ? "Unsaved changes"
      : status === "saving"
        ? "Saving…"
        : status === "saved"
          ? "Saved"
          : status === "error"
            ? "Couldn’t save"
            : "Ready";

  <output className="text-[0.6875rem] text-muted-foreground" aria-live="polite">
    {label}
  </output>;
}

export function NoteSheet() @{
  const actorRef = BoardActor.useActorRef();
  const mode = BoardActor.useSelector((snapshot) => snapshot.value);
  const context = BoardActor.useSelector((snapshot) => snapshot.context);
  const [saveStatus, setSaveStatus] = useState<NoteSaveStatus>("idle");
  const lastTaskRef = useRef<OpenNoteTask | undefined>(undefined);
  const lane = context.lanes.find((candidate) => candidate.id === context.cursor.laneId);
  const task = lane?.tasks.find((candidate) => candidate.id === context.cursor.taskId);
  const currentOpenTask = useMemo<OpenNoteTask | undefined>(
    () =>
      mode === "notes" && task !== undefined && lane !== undefined
        ? { laneId: lane.id, task }
        : undefined,
    [lane, mode, task],
  );
  const openTask = currentOpenTask ?? lastTaskRef.current;
  const open = mode === "notes" && openTask !== undefined;

  useEffect(() => {
    if (currentOpenTask !== undefined) {
      const taskChanged = lastTaskRef.current?.task.id !== currentOpenTask.task.id;
      lastTaskRef.current = currentOpenTask;
      if (taskChanged) {
        setSaveStatus("idle");
      }
    }
  }, [currentOpenTask]);

  <Sheet
    open={open}
    onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        actorRef.send({ type: "notes.close" });
      }
    }}
  >
    @if (openTask !== undefined) {
      <SheetContent
        className="min-h-[50dvh] w-[calc(100%-2rem)] max-w-3xl rounded-t-xl data-[side=bottom]:right-auto data-[side=bottom]:left-1/2 data-[side=bottom]:-translate-x-1/2"
        side="bottom"
        overlayClassName="bg-black/10 backdrop-blur-none"
        initialFocus={() => document.querySelector<HTMLElement>("[data-note-editor]")}
        finalFocus={() =>
          document.querySelector<HTMLElement>(
            `#task-${CSS.escape(openTask.laneId)}-${CSS.escape(openTask.task.id)} [data-task-select]`,
          )
        }
      >
        <SheetHeader className="gap-0.5 px-4 py-3 pr-12 sm:px-6">
          <SheetTitle className="truncate text-base">{openTask.task.title}</SheetTitle>
          <SheetDescription className="sr-only">
            Notes for {openTask.task.title}
          </SheetDescription>
          <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            <NoteSaveStatusLabel status={saveStatus} />
            <span aria-hidden="true">·</span>
            <span>Markdown Supported</span>
          </div>
        </SheetHeader>
        @if (open) {
          <NoteEditor taskId={openTask.task.id} onStatusChange={setSaveStatus} />;
        }
      </SheetContent>;
    }
  </Sheet>;
}
