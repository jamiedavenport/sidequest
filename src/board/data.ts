import type { Lane } from "~/board/types";

export const lanes: Lane[] = [
  {
    id: "inbox",
    title: "Inbox",
    caption: "Capture now. Decide later.",
    kind: "inbox",
    colour: "green",
    shape: "square",
    tasks: [],
  },
  {
    id: "today",
    title: "Today",
    caption: "One thing at a time.",
    kind: "today",
    colour: "amber",
    shape: "circle",
    tasks: [],
  },
];
