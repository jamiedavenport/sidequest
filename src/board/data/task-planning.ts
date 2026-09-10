import type { Task } from "~/board/schema";
import { isTaskInView, placementForCreate } from "~/board/views";

export function planTaskCreate(
  tasks: ReadonlyArray<Task>,
  input: {
    id: string;
    viewId: string;
    title: string;
    date?: string;
    attachments?: Task["attachments"];
  },
  now = new Date(),
  today?: string,
): Task {
  return {
    id: input.id,
    title: input.title.trim(),
    rank:
      tasks
        .filter((task) => !task.completed && isTaskInView(task, input.viewId, now))
        .reduce((max, task) => Math.max(max, task.rank), -1) + 1,
    ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
    completed: false,
    collapsed: false,
    ...placementForCreate(input.viewId, input.date, now, today),
  };
}

export function planTaskUpdate(task: Task, patch: { title?: string; date?: string | null }): Task {
  const title = patch.title?.trim() ?? task.title;
  return {
    ...task,
    title,
    ...(patch.date === undefined ? {} : { date: patch.date ?? undefined }),
    ...(title === task.title
      ? {}
      : {
          attachments:
            task.attachments?.filter(
              (attachment) => attachment.type !== "link" || attachment.source === "manual",
            ) ?? [],
        }),
  };
}
