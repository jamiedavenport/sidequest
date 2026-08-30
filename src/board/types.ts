export type {
  Attachment,
  BoardLane,
  BoardTask,
  LaneSymbolColour,
  LaneSymbolShape,
  Task,
} from "~/board/schema";

export type VerticalDirection = "up" | "down";
export type HorizontalDirection = "left" | "right";

export type BoardContext = {
  lanes: import("~/board/schema").BoardLane[];
  selectedId: string | null;
  selectedLaneId: string | null;
  addingLaneId: string | null;
};
