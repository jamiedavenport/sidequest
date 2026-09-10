import { Clock, Effect } from "effect";
import { attachmentsForTitle } from "~/board/links/enrich";
import { titleMayContainHttpUrl } from "~/board/links/extract";
import type { Task } from "~/board/schema";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import { taskCollectionId } from "../collections";
import type { GetTask } from "../mutations/schema";
import { logBoardSync } from "../telemetry";

import type { TaskLinkUpdate } from "./apply";

export function getTasksNeedingLinks(mutations: ReadonlyArray<Mutation>, getTask: GetTask) {
  const ids = mutations.flatMap((mutation) => {
    if (mutation.collection !== taskCollectionId || mutation.type === "delete") {
      return [];
    }
    const task = getTask(mutation.key);
    if (!task || !titleMayContainHttpUrl(task.title)) {
      return [];
    }
    return [task.id];
  });
  return [...new Set(ids)];
}

const resolveTaskLinks = Effect.fn("resolveTaskLinks")(function* (task: Task) {
  yield* Effect.annotateCurrentSpan({ taskId: task.id });
  const attachments = yield* attachmentsForTitle(task.title);
  return { id: task.id, title: task.title, attachments };
});

export const enrichTaskLinks = Effect.fn("enrichTaskLinks")(function* (
  taskIds: ReadonlyArray<string>,
  getTask: GetTask,
  commit: (updates: ReadonlyArray<TaskLinkUpdate>) => Effect.Effect<number, SyncProtocolError>,
  originatingTransactionId: string,
) {
  const startedAt = yield* Clock.currentTimeMillis;
  const context = {
    enrichmentId: crypto.randomUUID(),
    originatingTransactionId,
    taskCount: taskIds.length,
  };
  yield* Effect.annotateCurrentSpan(context);
  yield* logBoardSync("enrichment_started", { ...context, outcome: "started" });
  yield* Effect.gen(function* () {
    const tasks = taskIds.flatMap((id) => {
      const task = getTask(id);
      return task ? [task] : [];
    });
    const resolved = yield* Effect.forEach(tasks, resolveTaskLinks);
    const updates = resolved.filter((update) => update.attachments.length > 0);
    const updateCount = updates.length > 0 ? yield* commit(updates) : 0;
    yield* logBoardSync("enrichment_finished", {
      ...context,
      durationMs: (yield* Clock.currentTimeMillis) - startedAt,
      outcome: updateCount > 0 ? "success" : "no_changes",
      updateCount,
    });
  }).pipe(
    Effect.catch(() =>
      logBoardSync("enrichment_finished", {
        ...context,
        durationMs: Date.now() - startedAt,
        outcome: "failure",
      }),
    ),
  );
});
