// oxlint-disable react-perf/jsx-no-new-function-as-prop
import {
  Accessibility,
  PointerActivationConstraints,
  PointerSensor,
  type DragDropManager,
  type DragEndEvent,
} from "@dnd-kit/dom";
import {
  DragDropProvider,
  DragOverlay,
  useDraggable,
  useDroppable,
  type UseDroppableInput,
} from "@dnd-kit/react";
import { Effect, Option, Schema } from "effect";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { useLaneChrome } from "./lane-chrome.tsrx";
import {
  DragSource,
  dropBoardEntity,
  type BoardDropTarget,
  type RunBoardMove,
} from "../data/mutations";
import { useBoardStore, useBoardSelector } from "~/board/navigation/provider.tsrx";
import { DragSource as NavigationDragSource, BoardEvent } from "~/board/navigation/model";
import { useBoardClient } from "../sync/client";
import { isSystemLane, planTaskDestination, taskSubtree } from "../views";

type DragContext = { target: BoardDropTarget | null; runMove: RunBoardMove; enabled: boolean };

const BoardDragContext = createContext<DragContext | null>(null);

export function useBoardDrag() {
  const context = useContext(BoardDragContext);
  if (context === null) {
    throw new Error("Board drag provider is missing");
  }
  return context;
}

const sensors = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 8 })]
        : [new PointerActivationConstraints.Distance({ value: 6 })],
    preventActivation: (event) => {
      if (!(event.target instanceof Element)) {
        return false;
      }
      const control = event.target.closest(
        'button, a, input, textarea, select, [contenteditable="true"], [role="button"], [role="menuitem"]',
      );
      return control !== null && !control.matches("[data-task-select], [data-lane-drag-surface]");
    },
  }),
];

// Preserve the existing row semantics and keyboard interface; only pointer dragging is added.
const plugins: Parameters<typeof DragDropProvider>[0]["plugins"] = (defaults) =>
  defaults.filter((plugin) => plugin !== Accessibility);

export function taskDragId(viewId: string, taskId: string) {
  return JSON.stringify([viewId, taskId]);
}

export function laneDragId(viewId: string) {
  return JSON.stringify([viewId]);
}

// Hit-test the actual painted surface, so clipped rows and areas outside the board cannot accept a drop.
const collisionDetector: NonNullable<UseDroppableInput["collisionDetector"]> = ({
  droppable,
  dragOperation,
}) => {
  const { x, y } = dragOperation.position.current;
  const hit = document.elementFromPoint(x, y);
  const source = dragOperation.source?.data;
  const surface = hit?.closest(
    Schema.is(DragSource)(source) && source.kind === "lane"
      ? "[data-lane-drop]"
      : "[data-board-drop]",
  );
  if (surface?.getAttribute("data-board-drop") !== droppable.id) {
    return null;
  }
  return { id: droppable.id, priority: 1, type: 2, value: 1 };
};

export function useTaskDrag(
  viewId: string,
  taskId: string,
  element: RefObject<HTMLLIElement | null>,
) {
  const { enabled, target } = useBoardDrag();
  const lane = useBoardSelector(
    (snapshot) => Option.getOrUndefined(snapshot.graph.lane(viewId))?.lane,
  );
  const id = taskDragId(viewId, taskId);
  const data = useMemo(() => ({ kind: "task", taskId, viewId }), [taskId, viewId]);
  useDraggable({ id, data, element, disabled: !enabled });
  useDroppable({ id, data, element, collisionDetector });
  if (target?.kind !== "task" || target.viewId !== viewId) {
    return undefined;
  }
  const markerId =
    target.edge === "after" && lane !== undefined
      ? taskSubtree(lane.tasks, target.taskId).at(-1)?.id
      : target.taskId;
  return markerId === taskId ? target.edge : undefined;
}

export function useLaneDrag(
  viewId: string,
  element: RefObject<HTMLElement | null>,
  header: RefObject<HTMLDivElement | null>,
) {
  const { enabled, target } = useBoardDrag();
  const id = laneDragId(viewId);
  const data = useMemo(() => ({ kind: "lane", viewId }), [viewId]);
  useDraggable({ id, data, element: header, disabled: !enabled || isSystemLane({ id: viewId }) });
  useDroppable({ id, data, element, collisionDetector });
  return target?.viewId === viewId && target.kind !== "task" ? target.edge : undefined;
}

export function BoardDragProvider({ children }: { children: ReactNode }) @{
  const client = useBoardClient();
  const store = useBoardStore();
  const mode = useBoardSelector((snapshot) => snapshot.interaction._tag);
  const { editingLaneId, removingLaneId } = useLaneChrome();
  const [target, setTarget] = useState<BoardDropTarget | null>(null);
  const [label, setLabel] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const managerRef = useRef<DragDropManager | null>(null);
  const suppressClick = useRef(false);
  const enabled =
    (mode === "Navigating" || mode === "Dragging") &&
    editingLaneId === null &&
    removingLaneId === null;

  const runMove: RunBoardMove = useCallback((command, onApplied) => {
    setFailure(null);
    void Effect.runPromise(
      command.pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            onApplied?.(result);
          }),
        ),
        Effect.flatMap((result) => result?.completion ?? Effect.void),
        Effect.catch((error) =>
          Effect.sync(() => {
            console.error("Failed to move board item", error);
            setFailure("Could not save the move. Please try again.");
          }),
        ),
      ),
    );
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (
        store.getSnapshot().interaction._tag === "Dragging" ||
        (suppressClick.current && event.detail > 0)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClick.current = false;
      }
    }
    function onPointerDown() {
      suppressClick.current = false;
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [store]);

  useEffect(() => {
    const manager = managerRef.current;
    if (mode !== "Dragging" && manager?.dragOperation.status.dragging) {
      manager.actions.stop({ canceled: true });
    }
  }, [mode]);

  function resolveTarget(
    operation: DragEndEvent["operation"],
    coordinates = operation.position.current,
  ): BoardDropTarget | null {
    const source = operation.source?.data;
    if (!Schema.is(DragSource)(source)) {
      return null;
    }
    const { x, y } = coordinates;
    const hit = document.elementFromPoint(x, y);
    const surfaceElement = hit?.closest(
      source.kind === "lane" ? "[data-lane-drop]" : "[data-board-drop]",
    );
    const id = surfaceElement?.getAttribute("data-board-drop");
    // Resolve the registered target at the latest coordinates, including a release between animation frames.
    const registered = id == null ? undefined : managerRef.current?.registry.droppables.get(id);
    const surface = registered?.data;
    const element = registered?.element;
    if (
      !Schema.is(DragSource)(surface) ||
      element === undefined ||
      !hit ||
      !element.contains(hit)
    ) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    if (source.kind === "lane") {
      if (
        surface.kind !== "lane" ||
        source.viewId === surface.viewId ||
        isSystemLane({ id: surface.viewId })
      ) {
        return null;
      }
      return {
        kind: "lane",
        viewId: surface.viewId,
        edge: x < rect.left + rect.width / 2 ? "before" : "after",
      };
    }
    const next: BoardDropTarget =
      surface.kind === "lane"
        ? { kind: "view", viewId: surface.viewId, edge: "append" }
        : {
            ...surface,
            edge:
              y < rect.top + rect.height / 4
                ? "before"
                : y > rect.bottom - rect.height / 4
                  ? "after"
                  : "nest",
          };
    return planTaskDestination(client.tasks.toArray, source.taskId, source.viewId, next) ===
      undefined
      ? null
      : next;
  }

  function updateTarget(
    operation: DragEndEvent["operation"],
    coordinates = operation.position.current,
  ) {
    const next = resolveTarget(operation, coordinates);
    setTarget((previous) => {
      if (previous === null || next === null) {
        return previous === next ? previous : next;
      }
      return previous.kind === next.kind &&
        previous.viewId === next.viewId &&
        previous.edge === next.edge &&
        (previous.kind !== "task" || (next.kind === "task" && previous.taskId === next.taskId))
        ? previous
        : next;
    });
  }

  function finish(viewId?: string) {
    setTarget(null);
    suppressClick.current = true;
    store.send(
      viewId === undefined ? BoardEvent.DragCancel({}) : BoardEvent.DragFinish({ viewId }),
    );
    document.querySelector<HTMLElement>("[data-board-focus]")?.focus({ preventScroll: true });
  }

  const value = useMemo(() => ({ target, runMove, enabled }), [target, runMove, enabled]);

  <BoardDragContext value={value}>
    <DragDropProvider
      sensors={sensors}
      plugins={plugins}
      onBeforeDragStart={(event) => {
        const source = event.operation.source?.data;
        if (
          !enabled ||
          !(store.getSnapshot().interaction._tag === "Navigating") ||
          !Schema.is(DragSource)(source)
        ) {
          event.preventDefault();
          return;
        }
        store.send(
          BoardEvent.DragStart({
            source:
              source.kind === "task"
                ? NavigationDragSource.Task({
                    target: { viewId: source.viewId, taskId: source.taskId },
                  })
                : NavigationDragSource.Lane({ viewId: source.viewId }),
          }),
        );
        if (!(store.getSnapshot().interaction._tag === "Dragging")) {
          event.preventDefault();
        }
      }}
      onDragStart={({ operation }, manager) => {
        managerRef.current = manager;
        const source = operation.source?.data;
        if (Schema.is(DragSource)(source)) {
          setLabel(
            source.kind === "task"
              ? (client.tasks.get(source.taskId)?.title ?? "Task")
              : (client.lanes.get(source.viewId)?.title ?? "Lane"),
          );
        }
      }}
      onDragMove={({ operation, to }) => {
        updateTarget(operation, to);
      }}
      onDragOver={({ operation }) => {
        updateTarget(operation);
      }}
      onDragEnd={({ operation, canceled, nativeEvent }) => {
        const coordinates =
          nativeEvent instanceof PointerEvent
            ? { x: nativeEvent.clientX, y: nativeEvent.clientY }
            : operation.position.current;
        const next = canceled ? null : resolveTarget(operation, coordinates);
        if (!(store.getSnapshot().interaction._tag === "Dragging") || next === null) {
          finish();
          return;
        }
        runMove(
          dropBoardEntity(client, operation.source?.data, next).pipe(
            Effect.onError(() =>
              Effect.sync(() => {
                finish();
              }),
            ),
          ),
          (result) => {
            finish(result?.viewId);
          },
        );
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        <div className="pointer-events-none w-60 truncate rounded-lg border border-primary/30 bg-background px-3 py-2 text-sm shadow-lg">
          {label}
        </div>
      </DragOverlay>
    </DragDropProvider>
    @if (failure !== null) {
      <div
        role="alert"
        className="fixed inset-x-3 bottom-12 z-50 rounded-lg border border-destructive/30 bg-background p-3 text-sm text-destructive"
      >
        {failure}
      </div>;
    }
  </BoardDragContext>;
}
