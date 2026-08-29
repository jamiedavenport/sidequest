import type { Lane } from "~/components/board/types";

export const lanes: Lane[] = [
  {
    id: "inbox",
    title: "Inbox",
    caption: "Capture now. Decide later.",
    count: 3,
    kind: "inbox",
    colour: "green",
    shape: "square",
    tasks: [
      {
        id: "dentist",
        title: "Book dentist appointment",
        date: "Today",
        selected: true,
      },
      {
        id: "sync-notes",
        title: "Read offline sync notes",
        link: {
          label: "Scaling the Linear sync engine",
          meta: "linear.app · Engineering",
          href: "https://linear.app/blog/scaling-the-linear-sync-engine",
          mark: "L",
        },
      },
      { id: "weekend-shop", title: "Plan weekend shop", date: "Sat, 31 Aug" },
    ],
  },
  {
    id: "today",
    title: "Today",
    caption: "One thing at a time.",
    count: 4,
    kind: "today",
    colour: "amber",
    shape: "circle",
    tasks: [
      {
        id: "interaction-model",
        title: "Refine interaction model",
        date: "Today",
        subtaskProgress: "2 of 3",
      },
      { id: "command-menu", title: "Prototype command menu", depth: 1 },
      { id: "fuzzy-search", title: "Test fuzzy search", depth: 2 },
      { id: "mobile-gestures", title: "Check mobile gestures", depth: 1 },
      {
        id: "run",
        title: "Go for a run",
        date: "Today",
        recurrence: "Every Friday",
      },
    ],
  },
  {
    id: "sidequest",
    title: "Sidequest",
    caption: "Build the calmest task manager.",
    count: 5,
    kind: "project",
    colour: "blue",
    shape: "diamond",
    tasks: [
      { id: "mockups", title: "Create high-fidelity mockups", date: "Today" },
      { id: "database", title: "Evaluate local-first database", date: "2 Sep" },
      {
        id: "electric",
        title: "Track ElectricSQL integration",
        link: {
          label: "electric-sql / electric",
          meta: "Postgres sync engine for local-first apps",
          href: "https://github.com/electric-sql/electric",
          mark: "GH",
          stat: "8.6k",
        },
      },
      { id: "mcp", title: "Define MCP tools", date: "5 Sep" },
      { id: "offline", title: "Test offline task creation" },
    ],
  },
  {
    id: "life",
    title: "Life admin",
    caption: "Small things, safely held.",
    count: 3,
    kind: "life",
    colour: "violet",
    shape: "square",
    tasks: [
      { id: "insurance", title: "Renew contents insurance", date: "12 Sep" },
      { id: "plants", title: "Water the plants", recurrence: "Every Sunday" },
      { id: "meter", title: "Send meter reading" },
    ],
  },
];
