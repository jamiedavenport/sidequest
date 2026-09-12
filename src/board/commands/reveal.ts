import { Effect, Option, Schema } from "effect";
import { setTaskCollapsed } from "~/board/data/mutations";
import { setLanePrivacy } from "~/board/data/privacy";
import type { BoardStore } from "~/board/navigation/store";
import type { BoardClient } from "~/board/sync/client-types";
import { isTaskInView } from "~/board/views";
import type { CommandTarget } from "./results";

type BoardTarget = Exclude<CommandTarget, { kind: "setting" }>;

export class CommandTargetError extends Schema.TaggedError<CommandTargetError>()(
  "CommandTargetError",
  {
    message: Schema.String,
  },
) {}

export function isCommandTargetAvailable(
  client: Pick<BoardClient, "lanes" | "tasks">,
  target: BoardTarget,
): boolean {
  const viewId = target.kind === "task" ? target.target.viewId : target.viewId;
  if (!client.lanes.has(viewId)) {
    return false;
  }
  if (target.kind === "lane") {
    return true;
  }
  const task = client.tasks.get(target.target.taskId);
  return task !== undefined && !task.completed && isTaskInView(task, viewId);
}

const expandTaskAncestors = Effect.fn("expandTaskAncestors")(function* (
  client: BoardClient,
  taskId: string,
) {
  const ancestors: string[] = [];
  const seen = new Set([taskId]);
  let parentId = client.tasks.get(taskId)?.parentId;
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = client.tasks.get(parentId);
    if (!parent) {
      break;
    }
    if (parent.collapsed) {
      ancestors.unshift(parent.id);
    }
    parentId = parent.parentId;
  }
  yield* Effect.annotateCurrentSpan({ taskId, ancestorCount: ancestors.length });
  yield* Effect.forEach(ancestors, (id) => setTaskCollapsed(client, id, false), { discard: true });
});

const awaitVisibleTarget = Effect.fn("awaitVisibleTarget")(
  (client: BoardClient, store: BoardStore, target: BoardTarget) =>
    Effect.callback<void, CommandTargetError>((resume) => {
      const checkTarget = () => {
        if (!isCommandTargetAvailable(client, target)) {
          resume(
            Effect.fail(new CommandTargetError({ message: "This result changed. Search again." })),
          );
          return;
        }
        const graph = store.getSnapshot().graph;
        const viewId = target.kind === "task" ? target.target.viewId : target.viewId;
        const lane = Option.getOrUndefined(graph.lane(viewId));
        if (
          lane &&
          !lane.lane.hidden &&
          (target.kind === "lane" || Option.isSome(graph.visibleTask(target.target)))
        ) {
          resume(Effect.void);
        }
      };
      const unsubscribe = store.subscribe(checkTarget);
      checkTarget();
      return Effect.sync(unsubscribe);
    }),
);

export const revealCommandTarget = Effect.fn("revealCommandTarget")(function* (
  client: BoardClient,
  store: BoardStore,
  target: BoardTarget,
) {
  if (!isCommandTargetAvailable(client, target)) {
    return yield* new CommandTargetError({ message: "This result changed. Search again." });
  }
  const laneId = target.kind === "task" ? target.target.viewId : target.viewId;
  yield* Effect.annotateCurrentSpan({ laneId });
  if (client.lanes.get(laneId)?.hidden) {
    yield* setLanePrivacy(client, laneId, false);
  }
  if (target.kind === "task") {
    yield* expandTaskAncestors(client, target.target.taskId);
  }
  yield* awaitVisibleTarget(client, store, target);
  return undefined;
});
