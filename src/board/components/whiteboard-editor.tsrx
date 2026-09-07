// The canvas owns keyboard/pointer interaction; toolbar clicks delegate focus
// from their accessible buttons back to the canvas, including keyboard clicks.
// oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
// oxlint-disable react-perf/jsx-no-new-function-as-prop
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  convertToExcalidrawElements,
  restoreElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
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
  Square,
  Type,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import type { EditorSaveStatus } from "~/board/components/editor-save-status";
import { saveWhiteboard } from "~/board/data/mutations";
import {
  decodeExcalidrawDocument,
  getDocumentKey,
  readWhiteboardDocument,
} from "~/board/whiteboard-document";
import type { ExcalidrawDocument } from "~/board/whiteboard-document";
import { useBoardClient } from "~/board/sync/client.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import { Separator } from "~/components/ui/separator.tsrx";
import { Toggle } from "~/components/ui/toggle.tsrx";
import "./whiteboard-editor.css";

const shortcuts = {
  v: "selection",
  h: "hand",
  d: "freedraw",
  e: "eraser",
  a: "arrow",
  t: "text",
  r: "rectangle",
  o: "ellipse",
} as const;

type WhiteboardTool = (typeof shortcuts)[keyof typeof shortcuts];

const uiOptions: ExcalidrawProps["UIOptions"] = {
  tools: { image: false },
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    toggleTheme: false,
    saveAsImage: false,
  },
};

function setZoom(editor: ExcalidrawImperativeAPI, value: number) {
  const state = editor.getAppState();
  // Excalidraw brands zoom values; clamp to its supported range before branding.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const next = Math.max(0.1, Math.min(30, value)) as AppState["zoom"]["value"];
  editor.updateScene({
    appState: {
      zoom: { value: next },
      scrollX: state.scrollX + state.width / (2 * next) - state.width / (2 * state.zoom.value),
      scrollY: state.scrollY + state.height / (2 * next) - state.height / (2 * state.zoom.value),
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

function createDocument(elements: readonly ExcalidrawElement[]): ExcalidrawDocument {
  // Excalidraw includes optional undefined fields; persist only JSON scene data.
  return decodeExcalidrawDocument(
    JSON.parse(JSON.stringify({ type: "excalidraw", version: 1, elements })),
  );
}

function restoreDocument(document: ExcalidrawDocument) {
  // The shared schema validates JSON before the version-matched editor restores it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
  return restoreElements(document.elements as unknown as ExcalidrawElement[], null);
}

function createInitialScene(input: unknown) {
  try {
    const document = readWhiteboardDocument(input);
    const elements = restoreDocument(document);
    return {
      loadFailed: false,
      document: createDocument(elements),
      data: {
        elements,
        scrollToContent: elements.length > 0,
        appState: { viewBackgroundColor: "#ffffff" },
      },
    };
  } catch {
    const document = readWhiteboardDocument(undefined);
    return { loadFailed: true, document, data: { elements: [], scrollToContent: false } };
  }
}

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, [contenteditable=true]"))
  );
}

function ToolToggle({
  activeTool,
  editor,
  hotkey,
  icon: Icon,
  label,
  tool,
}: {
  activeTool: string;
  editor: ExcalidrawImperativeAPI;
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
        editor.setActiveTool({ type: tool });
      }
    }}
  >
    <Icon />
  </Toggle>;
}

function WhiteboardControls({
  editor,
  activeTool,
  zoom,
}: {
  editor: ExcalidrawImperativeAPI;
  activeTool: string;
  zoom: number;
}) @{
  <>
    <div
      className="pointer-events-auto absolute top-3 right-3 z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover/95 p-1 text-popover-foreground shadow-sm backdrop-blur-sm"
      role="toolbar"
      aria-label="Whiteboard zoom"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) =>
        event.currentTarget.parentElement?.querySelector<HTMLElement>(".excalidraw")?.focus()
      }
    >
      <Button
        size="icon"
        type="button"
        variant="ghost"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => setZoom(editor, zoom / 1.2)}
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
        onClick={() => setZoom(editor, 1)}
      >
        {Math.round(zoom * 100)}%
      </Button>
      <Button
        size="icon"
        type="button"
        variant="ghost"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => setZoom(editor, zoom * 1.2)}
      >
        <ZoomIn />
      </Button>
      <Button
        size="icon"
        type="button"
        variant="ghost"
        aria-label="Fit drawing to view"
        title="Fit drawing to view"
        onClick={() =>
          editor.scrollToContent(undefined, {
            fitToViewport: true,
            viewportZoomFactor: 0.8,
            animate: true,
          })
        }
      >
        <Focus />
      </Button>
    </div>
    <div
      className="pointer-events-auto absolute bottom-3 left-1/2 z-50 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-popover/95 p-1 text-popover-foreground shadow-sm backdrop-blur-sm"
      role="toolbar"
      aria-label="Whiteboard drawing tools"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) =>
        event.currentTarget.parentElement?.querySelector<HTMLElement>(".excalidraw")?.focus()
      }
    >
      <ToolToggle
        activeTool={activeTool}
        editor={editor}
        hotkey="V"
        icon={MousePointer2}
        label="Select"
        tool="selection"
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
        tool="freedraw"
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
  const [initial] = useState(() => createInitialScene(whiteboard?.document));
  const [editor, setEditor] = useState<ExcalidrawImperativeAPI | null>(null);
  const editorRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const fitFrameRef = useRef<number | undefined>(undefined);
  const [activeTool, setActiveTool] = useState<string>("selection");
  const [zoom, setZoomValue] = useState(1);
  const [loadFailed, setLoadFailed] = useState(initial.loadFailed);
  const loadFailedRef = useRef(initial.loadFailed);
  const initializedRef = useRef(false);
  const documentKeyRef = useRef(getDocumentKey(initial.document));
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const saveAfterCurrentRef = useRef(false);
  const revisionRef = useRef(0);
  const latestDocumentRef = useRef(initial.document);
  const mountedRef = useRef(true);
  const flushRef = useRef<() => void>(() => undefined);

  const flush = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (loadFailedRef.current || !dirtyRef.current) {
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

  const onChange = useCallback<NonNullable<ExcalidrawProps["onChange"]>>(
    (elements, appState) => {
      setActiveTool(appState.activeTool.type);
      setZoomValue(appState.zoom.value);
      if (appState.isLoading || loadFailedRef.current) {
        return;
      }
      try {
        const document = createDocument(elements);
        const key = getDocumentKey(document);
        if (!initializedRef.current) {
          initializedRef.current = true;
          if (elements.some((element) => !element.isDeleted)) {
            fitFrameRef.current = requestAnimationFrame(() => {
              editorRef.current?.scrollToContent(undefined, {
                fitToViewport: true,
                viewportZoomFactor: 0.8,
              });
            });
          }
          documentKeyRef.current = key;
          latestDocumentRef.current = document;
          onStatusChange(whiteboard?.document === undefined ? "idle" : "saved");
          return;
        }
        if (key === documentKeyRef.current) {
          return;
        }
        documentKeyRef.current = key;
        latestDocumentRef.current = document;
        revisionRef.current += 1;
        dirtyRef.current = true;
        onStatusChange("dirty");
        if (timerRef.current !== undefined) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => flushRef.current(), 500);
      } catch {
        loadFailedRef.current = true;
        setLoadFailed(true);
        onStatusChange("error");
      }
    },
    [onStatusChange, whiteboard],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (dirtyRef.current || savingRef.current) {
      flushRef.current();
      return;
    }
    try {
      const elements = restoreDocument(readWhiteboardDocument(whiteboard?.document));
      const next = createDocument(elements);
      const key = getDocumentKey(next);
      if (key !== documentKeyRef.current) {
        documentKeyRef.current = key;
        latestDocumentRef.current = next;
        editor.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
      }
      loadFailedRef.current = false;
      setLoadFailed(false);
      onStatusChange(whiteboard?.document === undefined ? "idle" : "saved");
    } catch {
      loadFailedRef.current = true;
      setLoadFailed(true);
      onStatusChange("error");
    }
  }, [editor, onStatusChange, whiteboard?.document]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fitFrameRef.current !== undefined) {
        cancelAnimationFrame(fitFrameRef.current);
      }
      flushRef.current();
    };
  }, []);

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !editor ||
      isTextInput(event.target) ||
      editor.getAppState().editingTextElement ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    const tool = Object.entries(shortcuts).find(([shortcut]) => shortcut === key)?.[1];
    if (!event.metaKey && !event.ctrlKey && !event.altKey && tool) {
      event.preventDefault();
      event.stopPropagation();
      editor.setActiveTool({ type: tool });
    } else if (
      key === "?" ||
      (event.altKey && key === "z") ||
      (!event.metaKey && !event.ctrlKey && !event.altKey && ["9", "0", "q"].includes(key))
    ) {
      // Disable library/help and unsupported tool shortcuts alongside their hidden UI.
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onPaste: NonNullable<ExcalidrawProps["onPaste"]> = (data) => {
    if (
      !editor ||
      loadFailedRef.current ||
      (data.files && Object.keys(data.files).length > 0) ||
      data.mixedContent ||
      data.spreadsheet
    ) {
      return false;
    }
    if (data.elements) {
      try {
        createDocument(data.elements);
        return true;
      } catch {
        return false;
      }
    }
    if (data.text) {
      const state = editor.getAppState();
      // Plain text stays text, including URLs, SVG markup and Mermaid source.
      const elements = convertToExcalidrawElements([
        {
          type: "text",
          text: data.text,
          x: state.width / (2 * state.zoom.value) - state.scrollX,
          y: state.height / (2 * state.zoom.value) - state.scrollY,
        },
      ]);
      editor.updateScene({
        elements: [...editor.getSceneElementsIncludingDeleted(), ...elements],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    }
    return false;
  };

  <div
    className="sidequest-whiteboard relative h-full min-h-0 w-full flex-1 basis-0 overflow-hidden border-t border-border bg-background"
    data-whiteboard-editor=""
    role="application"
    aria-label="Whiteboard"
    tabIndex={-1}
    onKeyDownCapture={onKeyDownCapture}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onContextMenuCapture={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }}
    onDropCapture={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }}
    onDragOverCapture={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }}
    onPasteCapture={(event) => {
      if (
        event.clipboardData.files.length > 0 ||
        (!isTextInput(event.target) &&
          (/<(?:img|svg|iframe|video|object)\b/i.test(event.clipboardData.getData("text/html")) ||
            /^\s*<svg\b/i.test(event.clipboardData.getData("text/plain"))))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }}
  >
    <Excalidraw
      excalidrawAPI={(api) => {
        editorRef.current = api;
        setEditor(api);
      }}
      initialData={initial.data}
      onChange={onChange}
      onPaste={onPaste}
      UIOptions={uiOptions}
      handleKeyboardGlobally={false}
      zenModeEnabled
      aiEnabled={false}
      validateEmbeddable={false}
      viewModeEnabled={loadFailed}
    >
      <MainMenu />
    </Excalidraw>
    @if (loadFailed) {
      <div
        role="alert"
        className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 p-6 text-sm text-muted-foreground"
      >
        This whiteboard could not be loaded. Its saved document has been left unchanged.
      </div>;
    } @else if (editor) {
      <WhiteboardControls editor={editor} activeTool={activeTool} zoom={zoom} />;
    }
  </div>;
}
