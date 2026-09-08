import { DateTime, Schema } from "effect";

import { createSeedNote } from "~/board/seeds/onboarding";
import { SeedAnchorDate, type BoardSeed } from "~/board/seeds/schema";
import { createReleaseWhiteboard } from "~/board/seeds/whiteboard";

export function createDemoSeed({ anchorDate }: { anchorDate: string }): BoardSeed {
  const anchor = DateTime.makeUnsafe(Schema.decodeUnknownSync(SeedAnchorDate)(anchorDate));
  const date = (days: number) => DateTime.formatIsoDateUtc(DateTime.add(anchor, { days }));
  const launch = "demo-launch";
  const engineering = "demo-engineering";
  const learning = "demo-learning";
  const life = "demo-life";
  const tasks = [
    {
      id: "demo-ship-release",
      title: "Ship the next release",
      laneId: launch,
      date: date(0),
      rank: 100,
    },
    {
      id: "demo-release-checklist",
      title: "Run the release checklist",
      laneId: launch,
      date: date(0),
      parentId: "demo-ship-release",
      rank: 110,
    },
    {
      id: "demo-smoke-test",
      title: "Smoke-test signup and sync",
      laneId: launch,
      date: date(0),
      parentId: "demo-release-checklist",
      rank: 120,
    },
    {
      id: "demo-changelog",
      title: "Write the changelog",
      laneId: launch,
      date: date(0),
      parentId: "demo-ship-release",
      rank: 130,
    },
    {
      id: "demo-announcement",
      title: "Draft the release announcement",
      laneId: launch,
      date: date(0),
      parentId: "demo-ship-release",
      rank: 140,
    },
    {
      id: "demo-release-process",
      title: "Sketch the release process",
      laneId: launch,
      rank: 150,
    },
    {
      id: "demo-launch-feedback",
      title: "Read the first round of feedback",
      laneId: launch,
      date: date(2),
      rank: 160,
    },
    {
      id: "demo-release-metrics",
      title: "Check activation after launch",
      laneId: launch,
      date: date(7),
      rank: 170,
    },
    {
      id: "demo-release-scope",
      title: "Agree on the release scope",
      laneId: launch,
      rank: 180,
      completed: true,
    },
    {
      id: "demo-release-tag",
      title: "Choose the release name",
      laneId: launch,
      rank: 190,
      completed: true,
    },
    {
      id: "demo-improve-search",
      title: "Make search feel instant",
      laneId: engineering,
      rank: 200,
    },
    {
      id: "demo-search-query",
      title: "Profile the slowest search query",
      laneId: engineering,
      parentId: "demo-improve-search",
      rank: 210,
    },
    {
      id: "demo-search-tests",
      title: "Cover empty and partial matches",
      laneId: engineering,
      parentId: "demo-improve-search",
      rank: 220,
    },
    {
      id: "demo-flaky-build",
      title: "Investigate the flaky build",
      laneId: engineering,
      date: date(1),
      rank: 230,
      collapsed: true,
    },
    {
      id: "demo-build-logs",
      title: "Compare logs from failing runs",
      laneId: engineering,
      date: date(1),
      parentId: "demo-flaky-build",
      rank: 240,
    },
    {
      id: "demo-build-repro",
      title: "Reproduce the race locally",
      laneId: engineering,
      date: date(1),
      parentId: "demo-flaky-build",
      rank: 250,
    },
    {
      id: "demo-review-pr",
      title: "Review the keyboard navigation changes",
      laneId: engineering,
      date: date(0),
      rank: 260,
    },
    {
      id: "demo-search-accessibility",
      title: "Check search with a screen reader",
      laneId: engineering,
      date: date(3),
      rank: 270,
    },
    {
      id: "demo-cache-notes",
      title: "Document cache invalidation rules",
      laneId: engineering,
      rank: 280,
    },
    {
      id: "demo-dependency-audit",
      title: "Review dependency updates",
      laneId: engineering,
      date: date(5),
      rank: 290,
    },
    {
      id: "demo-fix-empty-state",
      title: "Fix the empty search state",
      laneId: engineering,
      rank: 300,
      completed: true,
    },
    {
      id: "demo-build-baseline",
      title: "Record the build time baseline",
      laneId: engineering,
      rank: 310,
      completed: true,
    },
    {
      id: "demo-learn-spanish",
      title: "Build a small Spanish practice habit",
      laneId: learning,
      rank: 400,
    },
    {
      id: "demo-spanish-dialogue",
      title: "Practice ordering coffee out loud",
      laneId: learning,
      parentId: "demo-learn-spanish",
      rank: 410,
    },
    {
      id: "demo-spanish-listening",
      title: "Listen to a ten-minute Spanish story",
      laneId: learning,
      date: date(0),
      rank: 420,
    },
    {
      id: "demo-language-exchange",
      title: "Book a language exchange",
      laneId: learning,
      date: date(4),
      rank: 430,
    },
    {
      id: "demo-spanish-vocabulary",
      title: "Collect phrases for the next trip",
      laneId: learning,
      rank: 440,
    },
    {
      id: "demo-spanish-app",
      title: "Pick a vocabulary notebook",
      laneId: learning,
      rank: 450,
      completed: true,
    },
    {
      id: "demo-spanish-intro",
      title: "Write a short introduction in Spanish",
      laneId: learning,
      rank: 460,
      completed: true,
    },
    {
      id: "demo-weekend-trip",
      title: "Plan a weekend in Edinburgh",
      laneId: life,
      date: date(5),
      rank: 500,
      collapsed: true,
    },
    {
      id: "demo-book-train",
      title: "Compare Friday evening trains",
      laneId: life,
      date: date(5),
      parentId: "demo-weekend-trip",
      rank: 510,
    },
    {
      id: "demo-weekend-walk",
      title: "Choose a walk with a rainy-day backup",
      laneId: life,
      rank: 520,
    },
    {
      id: "demo-pack-bag",
      title: "Pack a light weekend bag",
      laneId: life,
      date: date(4),
      rank: 530,
    },
    {
      id: "demo-groceries",
      title: "Pick up dinner ingredients",
      laneId: life,
      date: date(0),
      rank: 540,
    },
    {
      id: "demo-trip-budget",
      title: "Set a weekend budget",
      laneId: life,
      rank: 550,
      completed: true,
    },
    {
      id: "demo-trip-dates",
      title: "Confirm the weekend dates",
      laneId: life,
      rank: 560,
      completed: true,
    },
    {
      id: "demo-capture-search",
      title: "Idea: recent searches as a starting point",
      rank: 600,
    },
    {
      id: "demo-capture-book",
      title: "Find that book about building small tools",
      rank: 610,
    },
    {
      id: "demo-capture-cafe",
      title: "Ask Alex for the Edinburgh café recommendation",
      rank: 620,
    },
    {
      id: "demo-call-friend",
      title: "Call a friend on the way home",
      date: date(0),
      rank: 630,
    },
  ];
  const notes: Record<string, string[]> = {
    "demo-ship-release": [
      "Goal: ship a quieter, faster task board with predictable keyboard navigation and clearer search results.",
      "Release gate: signup works, offline edits reconnect, and a second device receives changes. Run the checklist against a fresh account before tagging.",
      "Keep the announcement focused on what changed for someone using the app. Watch error reports after deploy and keep the previous release ready if sync regresses.",
    ],
    "demo-release-process": [
      "Use the whiteboard to walk through the release with a teammate. Each box is a handoff: prepare the scope, verify the build, ship it, then observe real usage.",
      "A failed smoke check sends us back to preparation. After shipping, record what surprised us and turn one lesson into a checklist improvement.",
    ],
    "demo-improve-search": [
      "Typing should feel immediate even with a few thousand tasks. Measure time from keystroke to visible results before choosing an optimization.",
      "Try exact titles, partial words, punctuation, and an empty query. Keep keyboard selection stable as results change, and make the no-results message useful.",
      "First experiment: profile the query and rendering separately. Only add caching if repeated work is the actual bottleneck.",
    ],
    "demo-flaky-build": [
      "The failure appears intermittently in the sync suite and disappears on rerun. Save the first failing log; a green rerun is evidence of timing sensitivity, not a fix.",
      "Compare worker startup, database readiness, and assertion timestamps. Reproduce with a cold cache and a single worker, then narrow the smallest sequence that still fails.",
      "Done when the cause is understood and a focused regression fails before the fix and passes after it. Avoid solving this by extending every timeout.",
    ],
    "demo-learn-spanish": [
      "Aim for ten minutes on weekdays. Speaking a little every day matters more than keeping a perfect streak.",
      "Start with phrases I can use: ordering coffee, asking for directions, and introducing myself. Read each phrase aloud, change one detail, then try it without looking.",
      "On Sunday, keep five useful phrases and retire anything I cannot imagine saying. Bring one question to the next language exchange.",
    ],
    "demo-weekend-trip": [
      "A relaxed weekend in Edinburgh: arrive Friday evening, leave Sunday afternoon, and leave room for wandering rather than scheduling every hour.",
      "Compare train times before booking a place to stay. Look for somewhere walkable from the station and keep the total within the weekend budget.",
      "Saturday: a long walk if the weather holds, a museum and a slow lunch if it rains. Ask Alex for a café and save one quiet hour for reading.",
    ],
  };
  const links = [
    {
      taskId: "demo-changelog",
      id: "demo-link-changelog",
      label: "Keep a Changelog",
      href: "https://keepachangelog.com/en/1.1.0/",
      meta: "A useful release-note format",
      mark: "K",
    },
    {
      taskId: "demo-search-accessibility",
      id: "demo-link-accessibility",
      label: "WAI-ARIA Authoring Practices",
      href: "https://www.w3.org/WAI/ARIA/apg/",
      meta: "Keyboard and accessibility patterns",
      mark: "W",
    },
    {
      taskId: "demo-weekend-walk",
      id: "demo-link-edinburgh",
      label: "Visit Edinburgh",
      href: "https://edinburgh.org/",
      meta: "Places to explore this weekend",
      mark: "E",
    },
  ];
  return {
    profile: "demo",
    version: 1,
    lanes: [
      { id: launch, title: "Launch", colour: "blue", shape: "circle", rank: 2 },
      { id: engineering, title: "Engineering", colour: "violet", shape: "diamond", rank: 3 },
      { id: learning, title: "Learning", colour: "green", shape: "square", rank: 4 },
      { id: life, title: "Life", colour: "amber", shape: "circle", rank: 5 },
    ],
    tasks: tasks.map((task) => ({
      completed: false,
      collapsed: false,
      ...task,
      attachments: links
        .filter((link) => link.taskId === task.id)
        .map(({ taskId: _taskId, ...link }) => ({ ...link, type: "link" as const })),
    })),
    notes: tasks.map((task) => ({
      taskId: task.id,
      content: createSeedNote(...(notes[task.id] ?? [])),
    })),
    whiteboards: [{ taskId: "demo-release-process", document: createReleaseWhiteboard() }],
  };
}
