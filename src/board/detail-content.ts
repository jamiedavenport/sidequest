import { Option } from "effect";

import type { NoteBlock, NoteDocument } from "~/board/schema";
import { readWhiteboardDocument } from "~/board/whiteboard-document";

function hasNoteBlockContent(block: NoteBlock): boolean {
  if (block.type === "paragraph" || block.type === "heading") {
    return block.content?.some((node) => node.text.trim().length > 0) ?? false;
  }
  return block.content.some((item) => item.content.some(hasNoteBlockContent));
}

export function hasNoteContent(document: NoteDocument | undefined): boolean {
  return document?.content.some(hasNoteBlockContent) ?? false;
}

export function hasWhiteboardContent(input: unknown): boolean {
  return Option.exists(Option.liftThrowable(readWhiteboardDocument)(input), (document) =>
    document.elements.some((element) => element.isDeleted === false),
  );
}
