export type LaneKind = "inbox" | "today" | "project" | "life";
export type LaneSymbolColour = "green" | "amber" | "blue" | "violet";
export type LaneSymbolShape = "square" | "circle" | "diamond";

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
  depth?: 1 | 2;
  selected?: boolean;
  link?: TaskLink;
};

export type Lane = {
  id: string;
  title: string;
  caption: string;
  count: number;
  kind: LaneKind;
  colour: LaneSymbolColour;
  shape: LaneSymbolShape;
  tasks: Task[];
};
