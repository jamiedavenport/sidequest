export type LaneKind = "inbox" | "today" | "project" | "life";
export type LaneSymbolColour = "green" | "amber" | "blue" | "violet";
export type LaneSymbolShape = "square" | "circle" | "diamond";
export type VerticalDirection = "up" | "down";
export type HorizontalDirection = "left" | "right";
export type TaskDepth = 1 | 2;

export type TaskLink = {
  label: string;
  meta: string;
  href: string;
  mark: string;
  stat?: string;
};

export type Task = {
  id: string;
  title: string;
  date?: string;
  recurrence?: string;
  subtaskProgress?: string;
  depth?: TaskDepth;
  link?: TaskLink;
};

export type Lane = {
  id: string;
  title: string;
  caption: string;
  kind: LaneKind;
  colour: LaneSymbolColour;
  shape: LaneSymbolShape;
  tasks: Task[];
};

export type BoardContext = {
  lanes: Lane[];
  selectedId: string | null;
  addingLaneId: string | null;
};
