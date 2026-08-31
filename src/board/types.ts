import type { BoardLane } from "~/board/schema";

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

export type BoardCursor = {
  laneId: string;
  taskId: string | null;
};

export type BoardContext = {
  lanes: BoardLane[];
  cursor: BoardCursor;
};
