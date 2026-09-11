import { isLaneHidden } from "./graph";
import type { BoardContext, BoardEvent } from "./model";

export function isHiddenLaneEvent(context: BoardContext, event: BoardEvent): boolean {
  switch (event._tag) {
    case "TaskSelect":
    case "TaskCreated":
    case "EditStart":
    case "DetailsOpen":
      return isLaneHidden(context.graph, event.target.viewId);
    case "AddStart":
    case "DragFinish":
      return isLaneHidden(context.graph, event.viewId);
    default:
      return false;
  }
}
