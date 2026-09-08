import { and, createLiveQueryCollection, eq, isUndefined, not, or, toArray } from "@tanstack/db";
import type { Collection } from "@tanstack/db";

import { format } from "date-fns";

import type { Lane } from "~/board/schema";
import type { SyncedTaskCollection } from "~/board/sync/collections";
import { inboxLaneId, todayLaneId } from "~/board/views";

const todayDateLabel = "Today";

const todayWrittenLabel = format(new Date(), "d MMM");

const todayIsoLabel = format(new Date(), "yyyy-MM-dd");

export function createDerivedBoardCollections(
  lanes: Collection<Lane, string>,
  tasks: SyncedTaskCollection,
) {
  const inbox = createLiveQueryCollection({
    id: "inbox-tasks",
    startSync: true,
    gcTime: 0,
    getKey: (task) => task.id,
    query: (q) =>
      q
        .from({ task: tasks })
        .where(({ task }) =>
          and(
            eq(task.completed, false),
            or(isUndefined(task.laneId), eq(task.laneId, inboxLaneId)),
            or(
              isUndefined(task.date),
              and(
                not(eq(task.date, todayDateLabel)),
                not(eq(task.date, todayWrittenLabel)),
                not(eq(task.date, todayIsoLabel)),
              ),
            ),
          ),
        )
        .orderBy(({ task }) => task.rank, "asc"),
  });

  const today = createLiveQueryCollection({
    id: "today-tasks",
    startSync: true,
    gcTime: 0,
    getKey: (task) => task.id,
    query: (q) =>
      q
        .from({ task: tasks })
        .where(({ task }) =>
          and(
            eq(task.completed, false),
            or(
              eq(task.date, todayDateLabel),
              eq(task.date, todayWrittenLabel),
              eq(task.date, todayIsoLabel),
              eq(task.laneId, todayLaneId),
            ),
          ),
        )
        .orderBy(({ task }) => task.rank, "asc"),
  });

  const projects = createLiveQueryCollection({
    id: "project-lanes",
    startSync: true,
    gcTime: 0,
    getKey: (lane) => lane.id,
    query: (q) =>
      q
        .from({ lane: lanes })
        .where(({ lane }) => and(not(eq(lane.id, inboxLaneId)), not(eq(lane.id, todayLaneId))))
        .orderBy(({ lane }) => lane.rank, "asc")
        .select(({ lane }) => ({
          ...lane,
          tasks: toArray(
            q
              .from({ task: tasks })
              .where(({ task }) => and(eq(task.completed, false), eq(task.laneId, lane.id)))
              .orderBy(({ task }) => task.rank, "asc"),
          ),
        })),
  });

  return { inbox, today, projects };
}
