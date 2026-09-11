import { useLiveQuery } from "@tanstack/react-db";

import type { BoardClient } from "~/board/sync/client-types";
import { boardViewIds, isTaskInView, projectTasksForView } from "~/board/views";

export function useBoardLanes(client: BoardClient) {
  const lanesQuery = useLiveQuery((q) => q.from({ lane: client.lanes }));
  const tasksQuery = useLiveQuery((q) => q.from({ task: client.tasks }));
  const storedLanes = lanesQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const byId = new Map(storedLanes.map((lane) => [lane.id, lane]));
  const now = new Date();
  const lanes = boardViewIds(storedLanes).flatMap((id) => {
    const lane = byId.get(id);
    if (lane === undefined) {
      return [];
    }
    return [
      {
        ...lane,
        tasks: projectTasksForView(
          tasks.filter((task) => !task.completed && isTaskInView(task, id, now)),
          tasks,
        ),
      },
    ];
  });

  return {
    lanes,
    tasks,
    hiddenLaneIds: lanes.filter((lane) => lane.hidden).map((lane) => lane.id),
    isReady: lanesQuery.isReady && tasksQuery.isReady,
  };
}
