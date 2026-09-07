// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { Option } from "effect";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import type { EditorSaveStatus } from "~/board/components/editor-save-status";
import { NoteEditor } from "~/board/components/note-editor.tsrx";
import { useBoardStore, useBoardSelector } from "~/board/navigation/provider.tsrx";
import { BoardEvent } from "~/board/navigation/model";
import type { Task, DetailTab } from "~/board/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet.tsrx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs.tsrx";

const LazyWhiteboardEditor = lazy(async () => {
  const module = await import("~/board/components/whiteboard-editor.tsrx");
  return { default: module.WhiteboardEditor };
});

type OpenDetailTask = {
  laneId: string;
  task: Task;
  tab: DetailTab;
};

function SaveStatusLabel({ status }: { status: EditorSaveStatus }) @{
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

function WhiteboardLoading() @{
  <div
    className="flex min-h-0 flex-1 items-center justify-center border-t border-border text-muted-foreground"
    data-whiteboard-editor=""
    tabIndex={-1}
  >
    Loading whiteboard…
  </div>;
}

export function DetailSheet() @{
  const store = useBoardStore();
  const mode = useBoardSelector((snapshot) => snapshot.interaction._tag);
  const context = useBoardSelector((snapshot) => snapshot);
  const [noteSaveStatus, setNoteSaveStatus] = useState<EditorSaveStatus>("idle");
  const [whiteboardSaveStatus, setWhiteboardSaveStatus] = useState<EditorSaveStatus>("idle");
  const lastTaskRef = useRef<OpenDetailTask | undefined>(undefined);
  const details = context.interaction._tag === "Details" ? context.interaction : undefined;
  const node =
    details === undefined
      ? undefined
      : Option.getOrUndefined(context.graph.visibleTask(details.target));
  const currentOpenTask = useMemo<OpenDetailTask | undefined>(
    () =>
      details !== undefined && node !== undefined
        ? { laneId: node.target.viewId, task: node.task, tab: details.tab }
        : undefined,
    [details, node],
  );
  const openTask = currentOpenTask ?? lastTaskRef.current;
  const open = mode === "Details" && openTask !== undefined;
  const detailTab = details?.tab ?? openTask?.tab ?? "notes";
  const activeStatus = detailTab === "notes" ? noteSaveStatus : whiteboardSaveStatus;

  useEffect(() => {
    if (currentOpenTask !== undefined) {
      const taskChanged = lastTaskRef.current?.task.id !== currentOpenTask.task.id;
      lastTaskRef.current = currentOpenTask;
      if (taskChanged) {
        setNoteSaveStatus("idle");
        setWhiteboardSaveStatus("idle");
      }
    }
  }, [currentOpenTask]);

  <Sheet
    open={open}
    onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        store.send(BoardEvent.DetailsClose({}));
      }
    }}
  >
    @if (openTask !== undefined) {
      <SheetContent
        className="w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-t-xl data-[side=bottom]:right-auto data-[side=bottom]:left-1/2 data-[side=bottom]:h-[calc(100dvh-2rem)] data-[side=bottom]:-translate-x-1/2"
        side="bottom"
        initialFocus={() =>
          document.querySelector<HTMLElement>(
            detailTab === "notes"
              ? "[data-note-editor]"
              : '[data-detail-tab="whiteboard"], [data-whiteboard-editor]',
          )
        }
        finalFocus={() =>
          document.querySelector<HTMLElement>(
            `#task-${CSS.escape(openTask.laneId)}-${CSS.escape(openTask.task.id)} [data-task-select]`,
          )
        }
      >
        <SheetHeader className="gap-0.5 px-4 py-3 pr-12 sm:px-6">
          <SheetTitle className="truncate text-base">{openTask.task.title}</SheetTitle>
          <SheetDescription className="sr-only">
            Notes and whiteboard for {openTask.task.title}
          </SheetDescription>
        </SheetHeader>
        <Tabs
          className="min-h-0 flex-1 flex-col gap-0 overflow-hidden"
          value={detailTab}
          onValueChange={(value) => {
            if (value === "notes" || value === "whiteboard") {
              store.send(BoardEvent.DetailsTabSelect({ tab: value }));
            }
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-2 sm:px-6">
            <TabsList aria-label="Task details" variant="line">
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger data-detail-tab="whiteboard" value="whiteboard">
                Whiteboard
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
              <SaveStatusLabel status={activeStatus} />
              @if (detailTab === "notes") {
                <>
                  <span aria-hidden="true">·</span>
                  <span>Markdown Supported</span>
                </>;
              }
            </div>
          </div>
          @if (open && detailTab === "notes") {
            <TabsContent
              className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden"
              value="notes"
            >
              <NoteEditor
                key={openTask.task.id}
                taskId={openTask.task.id}
                onStatusChange={setNoteSaveStatus}
              />
            </TabsContent>;
          }
          @if (open && detailTab === "whiteboard") {
            <TabsContent
              className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden"
              value="whiteboard"
            >
              <ClientOnly fallback={<WhiteboardLoading />}>
                <Suspense fallback={<WhiteboardLoading />}>
                  <LazyWhiteboardEditor
                    key={openTask.task.id}
                    taskId={openTask.task.id}
                    onStatusChange={setWhiteboardSaveStatus}
                  />
                </Suspense>
              </ClientOnly>
            </TabsContent>;
          }
        </Tabs>
      </SheetContent>;
    }
  </Sheet>;
}
