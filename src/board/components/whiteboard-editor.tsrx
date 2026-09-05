// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useLiveQuery } from "@tanstack/react-db";
import { Effect } from "effect";
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Focus,
  Hand,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createTLStore,
  defaultHandleExternalTldrawContent,
  GeoShapeGeoStyle,
  getSnapshot,
  loadSnapshot,
  Tldraw,
  useEditor,
  useValue,
} from "tldraw";
import type { Editor, TLComponents, TLStore, TLStoreSnapshot, TLUiOverrides } from "tldraw";
import "tldraw/tldraw.css";

import type { EditorSaveStatus } from "~/board/components/editor-save-status";
import { saveWhiteboard } from "~/board/data/mutations";
import type { WhiteboardDocument } from "~/board/schema";
import { useBoardClient } from "~/board/sync/client";
import { Button } from "~/components/ui/button.tsrx";
import { Separator } from "~/components/ui/separator.tsrx";
import { Toggle } from "~/components/ui/toggle.tsrx";

const unsupportedShapeTypes = new Set(["bookmark", "embed", "image", "video"]);
const blockedActionIds = new Set([
  "convert-to-bookmark",
  "convert-to-embed",
  "download-original",
  "flatten-to-image",
  "image-replace",
  "insert-embed",
  "insert-media",
  "open-embed-link",
  "video-replace",
]);
const blockedToolIds = new Set(["asset", "embed"]);

type WhiteboardTool =
  | "select"
  | "hand"
  | "draw"
  | "eraser"
  | "arrow"
  | "text"
  | "rectangle"
  | "ellipse";

const whiteboardOverrides: TLUiOverrides = {
  actions: (_editor, actions) =>
    Object.fromEntries(Object.entries(actions).filter(([id]) => !blockedActionIds.has(id))),
  tools: (_editor, tools) =>
    Object.fromEntries(Object.entries(tools).filter(([id]) => !blockedToolIds.has(id))),
};

function activateTool(editor: Editor, tool: WhiteboardTool) {
  editor.run(() => {
    if (tool === "rectangle" || tool === "ellipse") {
      editor.setStyleForNextShapes(GeoShapeGeoStyle, tool);
      editor.setCurrentTool("geo");
      return;
    }

    editor.setCurrentTool(tool);
  });
}

function ToolToggle({
  activeTool,
  editor,
  hotkey,
  icon: Icon,
  label,
  tool,
}: {
  activeTool: WhiteboardTool;
  editor: Editor;
  hotkey: string;
  icon: LucideIcon;
  label: string;
  tool: WhiteboardTool;
}) @{
  <Toggle
    aria-keyshortcuts={hotkey}
    aria-label={label}
    pressed={activeTool === tool}
    title={`${label} (${hotkey})`}
    onPressedChange={(pressed) => {
      if (pressed) {
        activateTool(editor, tool);
      }
    }}
  >
    <Icon />
  </Toggle>;
}

function WhiteboardControls() @{
  const editor = useEditor();
  const activeTool = useValue<WhiteboardTool>(
    "whiteboard current tool",
    () => {
      const currentTool = editor.getCurrentToolId();
      if (currentTool === "geo") {
        return editor.getStyleForNextShape(GeoShapeGeoStyle) === "ellipse"
          ? "ellipse"
          : "rectangle";
      }
      return currentTool === "hand" ||
        currentTool === "draw" ||
        currentTool === "eraser" ||
        currentTool === "arrow" ||
        currentTool === "text"
        ? currentTool
        : "select";
    },
    [editor],
  );
  const canUndo = useValue("whiteboard can undo", () => editor.getCanUndo(), [editor]);
  const canRedo = useValue("whiteboard can redo", () => editor.getCanRedo(), [editor]);
  const zoom = useValue("whiteboard zoom", () => editor.getZoomLevel(), [editor]);

  <>
    <div
      className="pointer-events-auto absolute top-3 right-3 z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover/95 p-1 text-popover-foreground shadow-sm backdrop-blur-sm"
      role="toolbar"
      aria-label="Whiteboard history and zoom"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        size="icon"
        type="button"
        variant="ghost"
        aria-label="Undo"
        disabled={!canUndo}
        title="Undo"
        onClick={() => editor.undo()}
      >
        <Undo2 />
      </Button>
      <Button
        size="icon"
        type="button"
        variant="ghost"
        aria-label="Redo"
        disabled={!canRedo}
        title="Redo"
        onClick={() => editor.redo()}
      >
        <Redo2 />
      </Button>
      <Separator className="mx-1 h-5" orientation="vertical" />
      <Button
        size="icon"
        type="button"
        variant="ghost"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => editor.zoomOut(undefined, { animation: { duration: 180 } })}
      >
        <ZoomOut />
      </Button>
      <Button
        className="min-w-12 tabular-nums"
        size="default"
        type="button"
        variant="ghost"
        aria-label="Reset zoom to 100%"
        title="Reset zoom to 100%"
        onClick={() => editor.resetZoom(undefined, { animation: { duration: 180 } })}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <Button
        size="icon"
        type="button"
        variant="ghost"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => editor.zoomIn(undefined, { animation: { duration: 180 } })}
      >
        <ZoomIn />
      </Button>
      <Button
        size="icon"
        type="button"
        variant="ghost"
        aria-label="Fit drawing to view"
        title="Fit drawing to view"
        onClick={() => editor.zoomToFit({ animation: { duration: 180 } })}
      >
        <Focus />
      </Button>
    </div>
    <div
      className="pointer-events-auto absolute bottom-3 left-1/2 z-50 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-popover/95 p-1 text-popover-foreground shadow-sm backdrop-blur-sm"
      role="toolbar"
      aria-label="Whiteboard drawing tools"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="V"
        icon={MousePointer2}
        label="Select"
        tool="select"
      />
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="H"
        icon={Hand}
        label="Hand"
        tool="hand"
      />
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="D"
        icon={Pencil}
        label="Draw"
        tool="draw"
      />
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="E"
        icon={Eraser}
        label="Eraser"
        tool="eraser"
      />
      <Separator className="mx-1 h-5" orientation="vertical" />
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="A"
        icon={ArrowUpRight}
        label="Arrow"
        tool="arrow"
      />
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="T"
        icon={Type}
        label="Text"
        tool="text"
      />
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="R"
        icon={Square}
        label="Rectangle"
        tool="rectangle"
      />
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="O"
        icon={Circle}
        label="Ellipse"
        tool="ellipse"
      />
    </div>
  </>;
}

const whiteboardComponents: TLComponents = {
  ContextMenu: null,
  InFrontOfTheCanvas: WhiteboardControls,
};

type InitialStore = {
  loadFailed: boolean;
  store: TLStore;
};

function documentSnapshot(document: WhiteboardDocument): TLStoreSnapshot {
  const validatingStore = createTLStore();
  // Effect Schema establishes the JSON boundary; tldraw owns record validation and migrations.
  loadSnapshot(validatingStore, document);
  const snapshot = validatingStore.getStoreSnapshot();
  if (hasUnsupportedRecords(snapshot)) {
    throw new Error("Whiteboards cannot contain asset-backed shapes");
  }
  return snapshot;
}

function createInitialStore(document: WhiteboardDocument): InitialStore {
  try {
    const store = createTLStore();
    loadSnapshot(store, documentSnapshot(document));
    return { loadFailed: false, store };
  } catch {
    return { loadFailed: true, store: createTLStore() };
  }
}

function hasUnsupportedRecords(document: TLStoreSnapshot): boolean {
  return Object.values(document.store).some(
    (record) =>
      record.typeName === "asset" ||
      (record.typeName === "shape" && unsupportedShapeTypes.has(record.type)),
  );
}

function disableAssetIngestion(editor: Editor) {
  editor.registerExternalAssetHandler("file", null);
  editor.registerExternalAssetHandler("url", null);
  editor.registerExternalContentHandler("files", null);
  editor.registerExternalContentHandler("file-replace", null);
  editor.registerExternalContentHandler("url", null);
  editor.registerExternalContentHandler("embed", null);
  editor.registerExternalContentHandler("excalidraw", null);
  editor.registerExternalContentHandler("tldraw", (content) => {
    if (
      content.content.assets.length > 0 ||
      content.content.shapes.some((shape) => unsupportedShapeTypes.has(shape.type))
    ) {
      return;
    }
    void defaultHandleExternalTldrawContent(editor, content);
  });
}

export function WhiteboardEditor({
  taskId,
  onStatusChange,
}: {
  taskId: string;
  onStatusChange: (status: EditorSaveStatus) => void;
}) @{
  const client = useBoardClient();
  const whiteboardsQuery = useLiveQuery((query) => query.from({ whiteboard: client.whiteboards }));
  const whiteboard = whiteboardsQuery.data?.find((candidate) => candidate.taskId === taskId);
  const [initial] = useState(() =>
    whiteboard === undefined
      ? { loadFailed: false, store: createTLStore() }
      : createInitialStore(whiteboard.document),
  );
  const store = initial.store;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const saveAfterCurrentRef = useRef(false);
  const revisionRef = useRef(0);
  const latestDocumentRef = useRef<TLStoreSnapshot>(store.getStoreSnapshot());
  const mountedRef = useRef(true);
  const flushRef = useRef<() => void>(() => undefined);

  const flush = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (!dirtyRef.current) {
      return;
    }
    if (savingRef.current) {
      saveAfterCurrentRef.current = true;
      return;
    }

    const task = client.tasks.get(taskId);
    if (task === undefined || task.completed) {
      dirtyRef.current = false;
      if (mountedRef.current) {
        onStatusChange("error");
      }
      return;
    }

    const revision = revisionRef.current;
    const document = latestDocumentRef.current;
    savingRef.current = true;
    saveAfterCurrentRef.current = false;
    if (mountedRef.current) {
      onStatusChange("saving");
    }

    void Effect.runPromise(saveWhiteboard(client, { taskId, document })).then(
      () => {
        savingRef.current = false;
        if (revision === revisionRef.current && !saveAfterCurrentRef.current) {
          dirtyRef.current = false;
          if (mountedRef.current) {
            onStatusChange("saved");
          }
          return;
        }
        flushRef.current();
      },
      () => {
        savingRef.current = false;
        if (mountedRef.current) {
          onStatusChange("error");
        }
      },
    );
  }, [client, onStatusChange, taskId]);
  flushRef.current = flush;

  const onMount = useCallback(
    (editor: Editor) => {
      disableAssetIngestion(editor);
      onStatusChange(initial.loadFailed ? "error" : whiteboard === undefined ? "idle" : "saved");

      const frame =
        !initial.loadFailed && whiteboard !== undefined && editor.getCurrentPageShapeIds().size > 0
          ? requestAnimationFrame(() => editor.zoomToFit())
          : undefined;
      const stopListening = store.listen(
        () => {
          try {
            const document = getSnapshot(store).document;
            if (hasUnsupportedRecords(document)) {
              dirtyRef.current = false;
              onStatusChange("error");
              return;
            }

            latestDocumentRef.current = document;
            revisionRef.current += 1;
            dirtyRef.current = true;
            onStatusChange("dirty");
            if (timerRef.current !== undefined) {
              clearTimeout(timerRef.current);
            }
            timerRef.current = setTimeout(() => flushRef.current(), 500);
          } catch {
            onStatusChange("error");
          }
        },
        { source: "user", scope: "document" },
      );

      return () => {
        if (frame !== undefined) {
          cancelAnimationFrame(frame);
        }
        stopListening();
      };
    },
    [initial.loadFailed, onStatusChange, store, whiteboard],
  );

  useEffect(() => {
    const incoming = whiteboard?.document;
    if (incoming === undefined) {
      return;
    }

    if (dirtyRef.current || savingRef.current) {
      flushRef.current();
      return;
    }

    try {
      const next = documentSnapshot(incoming);
      if (JSON.stringify(next) === JSON.stringify(store.getStoreSnapshot())) {
        return;
      }
      store.mergeRemoteChanges(() => loadSnapshot(store, next));
      latestDocumentRef.current = next;
      onStatusChange("saved");
    } catch {
      onStatusChange("error");
    }
  }, [onStatusChange, store, whiteboard?.document]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flushRef.current();
    };
  }, []);

  <div
    className="tldraw__editor relative h-full min-h-0 w-full flex-1 basis-0 overflow-hidden border-t border-border bg-background"
    data-whiteboard-editor=""
    tabIndex={-1}
  >
    <Tldraw
      components={whiteboardComponents}
      hideUi
      onMount={onMount}
      overrides={whiteboardOverrides}
      store={store}
    />
  </div>;
}
