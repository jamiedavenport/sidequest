import { useLiveQuery } from "@tanstack/react-db";

import type { BoardClient } from "~/board/sync/client";
import type { BoardLane } from "~/board/schema";
import {
  inboxLaneId,
  projectTasksForView,
  systemLanes,
  todayLaneId,
} from "~/board/views";

function viewLane(id: typeof inboxLaneId | typeof todayLaneId): BoardLane {
  const lane = systemLanes.find((candidate) => candidate.id === id);
  if (lane === undefined) {
    throw new Error(`Missing system lane ${id}`);
  }

  return { ...lane, tasks: [] };
}

export function useBoardLanes(client: BoardClient): {
  lanes: BoardLane[];
  isReady: boolean;
} {
  const inboxQuery = useLiveQuery(client.inbox);
  const todayQuery = useLiveQuery(client.today);
  const projectsQuery = useLiveQuery(client.projects);
  const tasksQuery = useLiveQuery((q) => q.from({ task: client.tasks }));
  const inbox = inboxQuery.data ?? [];
  const today = todayQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const allTasks = tasksQuery.data ?? [];

  return {
    isReady:
      inboxQuery.isReady &&
      todayQuery.isReady &&
      projectsQuery.isReady &&
      tasksQuery.isReady,
    lanes: [
      { ...viewLane(todayLaneId), tasks: projectTasksForView(today, allTasks) },
      { ...viewLane(inboxLaneId), tasks: projectTasksForView(inbox, allTasks) },
      ...projects.map((lane) => ({
        ...lane,
        tasks: projectTasksForView(lane.tasks, allTasks),
      })),
    ],
  };
}
