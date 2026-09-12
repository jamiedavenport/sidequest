import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandTargetError,
  isCommandTargetAvailable,
  revealCommandTarget,
} from "~/board/commands/reveal";
import type { CommandTarget } from "~/board/commands/results";
import { completeTask } from "~/board/data/mutations";
import { BoardEvent } from "~/board/navigation/model";
import { useBoardStore } from "~/board/navigation/provider.tsrx";
import { useBoardClient } from "~/board/sync/client.tsrx";
import { useLaneChrome } from "../lane-chrome.tsrx";
import type { useCommandCalendar } from "./use-calendar";

function focusBoard() {
  return document.querySelector<HTMLElement>("[data-board-focus]");
}

function taskEvent(target: Extract<CommandTarget, { kind: "task" }>): BoardEvent {
  switch (target.action) {
    case "edit":
      return BoardEvent.EditStart({ target: target.target });
    case "notes":
    case "whiteboard":
      return BoardEvent.DetailsOpen({ target: target.target, tab: target.action });
    default:
      return BoardEvent.TaskSelect({ target: target.target });
  }
}

function useCommandHandoff(
  onOpenChange: (open: boolean) => void,
  onDismiss: () => void,
  onError: (message: string) => void,
) {
  const client = useBoardClient();
  const store = useBoardStore();
  const { startRename, openGithubSettings } = useLaneChrome();
  const handoff = useRef<(() => void) | null>(null);
  function finishCommand(action: () => void) {
    handoff.current = action;
    onOpenChange(false);
  }

  function focusTarget(target: Exclude<CommandTarget, { kind: "setting" }>) {
    focusBoard()?.focus({ preventScroll: true });
    if (!isCommandTargetAvailable(client, target)) {
      onError("This result changed. Search again.");
      onOpenChange(true);
      return;
    }
    if (target.kind === "task") {
      store.send(taskEvent(target));
      return;
    }
    store.send(BoardEvent.LaneFocus({ viewId: target.viewId }));
    switch (target.action) {
      case "add":
        store.send(BoardEvent.AddStart({ viewId: target.viewId }));
        break;
      case "rename":
        startRename(target.viewId);
        break;
      case "github":
        openGithubSettings(target.viewId);
        break;
    }
  }

  function restoreFocus() {
    const action = handoff.current ?? onDismiss;
    handoff.current = null;
    queueMicrotask(action);
    return false;
  }

  return { finishCommand, focusTarget, finalFocus: restoreFocus };
}

export function useCommandExecution(
  onOpenChange: (open: boolean) => void,
  onDismiss: () => void,
  changeCalendar: ReturnType<typeof useCommandCalendar>["changeCalendar"],
) {
  const client = useBoardClient();
  const store = useBoardStore();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const { finishCommand, focusTarget, finalFocus } = useCommandHandoff(
    onOpenChange,
    onDismiss,
    setError,
  );

  const executeCommand = Effect.fn("executeCommand")(function* (target: CommandTarget) {
    yield* Effect.annotateCurrentSpan({ kind: target.kind, action: target.action });
    if (target.kind === "setting") {
      if (target.action === "settings") {
        finishCommand(() => {
          void navigate({ to: "/settings" });
        });
      } else {
        yield* changeCalendar(target.action);
        finishCommand(() => {
          focusBoard()?.focus({ preventScroll: true });
        });
      }
      return;
    }
    yield* revealCommandTarget(client, store, target);
    if (target.kind === "task" && target.action === "complete") {
      yield* Effect.try({
        try: () => completeTask(client, target.target.taskId),
        catch: () =>
          new CommandTargetError({ message: "Could not complete this task. Please try again." }),
      });
      finishCommand(() => {
        focusBoard()?.focus({ preventScroll: true });
      });
      return;
    }
    finishCommand(() => focusTarget(target));
  });

  function selectCommand(target: CommandTarget) {
    if (running.current) {
      return;
    }
    running.current = true;
    setPending(true);
    setError(null);
    controller.current = new AbortController();
    void Effect.runPromiseExit(
      executeCommand(target).pipe(
        Effect.catch((failure) =>
          Effect.sync(() =>
            setError(
              "message" in failure
                ? failure.message
                : "Could not reveal this result. Please try again.",
            ),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            running.current = false;
            setPending(false);
          }),
        ),
      ),
      { signal: controller.current.signal },
    );
  }

  return { pending, error, selectCommand, finalFocus };
}
