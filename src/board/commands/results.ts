import type { Selection, TaskRef } from "~/board/navigation/model";
import { viewIdOf } from "~/board/navigation/model";
import type { Lane, Task } from "~/board/schema";
import { currentViewId, isSystemLane, isTaskInView } from "~/board/views";

type TaskAction = "complete" | "edit" | "notes" | "whiteboard";

type LaneAction = "add" | "rename" | "github";

export type SettingAction =
  | "settings"
  | "connect-google"
  | "enable-calendar"
  | "disable-calendar"
  | "reconnect-google"
  | "retry-calendar";

export type CommandTarget =
  | { kind: "task"; target: TaskRef; action: "focus" | TaskAction }
  | { kind: "lane"; viewId: string; action: "focus" | LaneAction }
  | { kind: "setting"; action: SettingAction };

export type CommandResult = {
  id: string;
  label: string;
  description?: string;
  target: CommandTarget;
};

export function getContextGroup(
  selection: Selection,
  lanes: readonly Lane[],
  tasks: readonly Task[],
): { heading: string; results: CommandResult[] } | undefined {
  if (selection._tag === "Task") {
    const task = tasks.find((item) => item.id === selection.target.taskId && !item.completed);
    if (!task) {
      return undefined;
    }
    const results: CommandResult[] = (
      [
        ["complete", "Complete"],
        ["edit", "Edit"],
        ["notes", "Open notes"],
        ["whiteboard", "Open whiteboard"],
      ] satisfies [TaskAction, string][]
    ).map(([action, label]) => ({
      id: `action:${action}:${task.id}`,
      label,
      target: { kind: "task", target: selection.target, action },
    }));
    return { heading: task.title, results };
  }
  const lane = lanes.find((item) => item.id === selection.viewId);
  if (!lane) {
    return undefined;
  }
  const actions: [LaneAction, string][] = [["add", "Add task"]];
  if (!isSystemLane(lane)) {
    actions.push(["rename", "Rename"]);
  }
  const results: CommandResult[] = actions.map(([action, label]) => ({
    id: `action:${action}:${lane.id}`,
    label,
    target: { kind: "lane", viewId: lane.id, action },
  }));
  return { heading: lane.title, results };
}

function getTaskResults(
  lanes: readonly Lane[],
  tasks: readonly Task[],
  focusedViewId: string,
): CommandResult[] {
  const now = new Date();
  const laneOrder = new Map(lanes.map((lane, index) => [lane.id, index]));
  return tasks
    .filter((task) => !task.completed)
    .map((task) => ({
      task,
      viewId: isTaskInView(task, focusedViewId, now) ? focusedViewId : currentViewId(task, now),
    }))
    .toSorted(
      (left, right) =>
        (laneOrder.get(left.viewId) ?? 0) - (laneOrder.get(right.viewId) ?? 0) ||
        left.task.rank - right.task.rank,
    )
    .map(({ task, viewId }) => ({
      id: `task:${task.id}`,
      label: task.title,
      description: lanes.find((lane) => lane.id === viewId)?.title,
      target: { kind: "task", target: { taskId: task.id, viewId }, action: "focus" },
    }));
}

export function getSearchResults(
  lanes: readonly Lane[],
  tasks: readonly Task[],
  selection: Selection,
) {
  const laneResults: CommandResult[] = lanes.map((lane) => ({
    id: `lane:${lane.id}`,
    label: lane.title,
    target: { kind: "lane", viewId: lane.id, action: "focus" },
  }));
  return { tasks: getTaskResults(lanes, tasks, viewIdOf(selection)), lanes: laneResults };
}

export function filterCommands(results: readonly CommandResult[], query: string, context = "") {
  const search = query.trim().toLocaleLowerCase();
  return results.filter((result) =>
    `${result.label} ${context}`.toLocaleLowerCase().includes(search),
  );
}
