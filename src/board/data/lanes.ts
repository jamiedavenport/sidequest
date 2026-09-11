import type { Lane } from "~/board/schema";
import { systemLanes } from "~/board/views";

// Initialize on the server: an empty client cache must never overwrite saved lane settings.
export function initializeLanes(lanes: {
  toArray: ReadonlyArray<Lane>;
  has: (id: string) => boolean;
  insert: (lane: Lane) => void;
  update: (id: string, updater: (draft: { hidden?: boolean }) => void) => void;
}): boolean {
  let changed = false;
  for (const lane of systemLanes) {
    if (!lanes.has(lane.id)) {
      lanes.insert(lane);
      changed = true;
    }
  }
  for (const lane of lanes.toArray) {
    if (lane.hidden === undefined) {
      lanes.update(lane.id, (draft) => {
        draft.hidden = false;
      });
      changed = true;
    }
  }
  return changed;
}
