import type { Task } from "~/board/schema";
import { Mutation } from "~/sync/protocol";
import { taskCollectionId, type BoardCollections } from "../collections";

export type TaskLinkUpdate = {
  id: string;
  title: string;
  attachments: NonNullable<Task["attachments"]>;
};

/** Apply only to the title that was resolved, while holding the board serialization queue. */
export function applyTaskLinks(
  tasks: Pick<BoardCollections["tasks"], "get" | "update">,
  updates: ReadonlyArray<TaskLinkUpdate>,
): Mutation[] {
  const outgoing: Mutation[] = [];
  for (const update of updates) {
    const current = tasks.get(update.id);
    if (!current || current.title !== update.title) {
      continue;
    }
    const existing = current.attachments ?? [];
    const hrefs = new Set(existing.flatMap((item) => ("href" in item ? [item.href] : [])));
    const added = update.attachments.filter((item) => "href" in item && !hrefs.has(item.href));
    if (added.length === 0) {
      continue;
    }
    tasks.update(update.id, (draft) => {
      draft.attachments = [...existing, ...added];
    });
    outgoing.push(
      new Mutation({
        collection: taskCollectionId,
        type: "update",
        key: current.id,
        value: tasks.get(current.id),
      }),
    );
  }
  return outgoing;
}
