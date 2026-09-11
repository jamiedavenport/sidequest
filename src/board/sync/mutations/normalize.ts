import { initializeLanes } from "~/board/data/lanes";
import { emptyNoteDocument } from "~/board/schema";
import { normalizeStoredBoard } from "~/board/views";
import type { BoardCollections } from "../collections";

export function normalizeBoardCollections(collections: BoardCollections) {
  initializeLanes(collections.lanes);
  normalizeStoredBoard({ lanes: collections.lanes, tasks: collections.tasks });
  for (const task of collections.tasks.toArray) {
    if (!collections.notes.has(task.id)) {
      collections.notes.insert({ taskId: task.id, content: emptyNoteDocument() });
    }
  }
  for (const note of collections.notes.toArray) {
    if (!collections.tasks.has(note.taskId)) {
      collections.notes.delete(note.taskId);
    }
  }
  for (const whiteboard of collections.whiteboards.toArray) {
    if (!collections.tasks.has(whiteboard.taskId)) {
      collections.whiteboards.delete(whiteboard.taskId);
    }
  }
}
