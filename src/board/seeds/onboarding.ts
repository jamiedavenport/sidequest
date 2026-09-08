import { emptyNoteDocument, type NoteDocument, type Task } from "~/board/schema";
import type { BoardSeed } from "~/board/seeds/schema";

export function createSeedNote(...paragraphs: string[]): NoteDocument {
  return paragraphs.length === 0
    ? emptyNoteDocument()
    : {
        type: "doc",
        content: paragraphs.map((text) => ({
          type: "paragraph",
          content: [{ type: "text", text }],
        })),
      };
}

export function createOnboardingSeed(): BoardSeed {
  const laneId = "onboarding-getting-started";
  const guides = [
    {
      id: "onboarding-edit-task",
      title: "Make this task your own",
      note: "Select a task and press E to edit its title. Save a small, clear action you want to take.",
    },
    {
      id: "onboarding-nest-task",
      title: "Break a task into smaller steps",
      note: "Select a task and press Tab to nest it under the task above. Shift+Tab moves it back out. Use the arrow beside a parent to show or hide its steps.",
    },
    {
      id: "onboarding-next-step",
      title: "Choose one small next step",
      parentId: "onboarding-nest-task",
      note: "This is a nested task. Nested steps share their parent's lane and date, so they travel together.",
    },
    {
      id: "onboarding-schedule-task",
      title: "Make room for something today",
      note: "Edit a task to choose a date, or move it to Today. Today gathers today's tasks, including tasks assigned to a custom lane.",
    },
    {
      id: "onboarding-add-note",
      title: "Give a task a little context",
      note: "Open Notes from a task's menu to capture details, a checklist, or a useful link. Notes save as you write. Try the Whiteboard tab when a sketch would help.",
    },
    {
      id: "onboarding-complete-task",
      title: "Finish a task and make this space yours",
      note: "Use the circle beside a task to complete it. Completing a parent also completes its nested steps. When you're ready, open the Getting started lane menu and choose Remove lane. Choose whether to delete its tasks or keep them in Inbox.",
    },
  ];
  const tasks = [
    ...guides.map((guide, index) => ({
      id: guide.id,
      title: guide.title,
      laneId,
      parentId: guide.parentId,
      rank: (index + 1) * 100,
      completed: false,
      collapsed: false,
    })),
    {
      id: "onboarding-inbox-capture",
      title: "Capture something on your mind",
      rank: 700,
      completed: false,
      collapsed: false,
    },
  ] satisfies Task[];
  return {
    profile: "onboarding",
    version: 1,
    lanes: [{ id: laneId, title: "Getting started", colour: "blue", shape: "circle", rank: 2 }],
    tasks,
    notes: tasks.map((task) => ({
      taskId: task.id,
      content: createSeedNote(
        guides.find((guide) => guide.id === task.id)?.note ??
          "Inbox holds tasks without a lane or today's date. Capture a thought here; you can organize it when you're ready.",
      ),
    })),
    whiteboards: [],
  } satisfies BoardSeed;
}
