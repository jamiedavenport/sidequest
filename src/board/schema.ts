import { Effect, Schema } from "effect";
import type { StandardSchemaV1 } from "effect/StandardSchema";

export const LaneSymbolColour = Schema.Literals(["green", "amber", "blue", "violet"]);
export type LaneSymbolColour = typeof LaneSymbolColour.Type;

export const LaneSymbolShape = Schema.Literals(["square", "circle", "diamond"]);
export type LaneSymbolShape = typeof LaneSymbolShape.Type;

const LinkAttachment = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("link"),
  source: Schema.optionalKey(Schema.Literals(["manual", "title"])),
  label: Schema.String,
  meta: Schema.String,
  href: Schema.String,
  mark: Schema.String,
  icon: Schema.optionalKey(Schema.String),
  stat: Schema.optionalKey(Schema.String),
});

const GitHubIssueAttachment = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("github-issue"),
  issueId: Schema.Number,
  repositoryId: Schema.Number,
  number: Schema.Number,
  repository: Schema.String,
  title: Schema.String,
  href: Schema.String,
});

export const MediaAttachment = Schema.Struct({
  id: Schema.NonEmptyString,
  type: Schema.Literals(["image", "video"]),
  filename: Schema.NonEmptyString,
  mimeType: Schema.NonEmptyString,
  size: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type MediaAttachment = typeof MediaAttachment.Type;

export const Attachment = Schema.Union([LinkAttachment, GitHubIssueAttachment, MediaAttachment]);
export type Attachment = typeof Attachment.Type;

export const Lane = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  colour: LaneSymbolColour,
  shape: LaneSymbolShape,
  rank: Schema.Number,
  hidden: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(false)),
    Schema.withConstructorDefault(Effect.succeed(false)),
  ),
});
export type Lane = typeof Lane.Type;

export const Task = Schema.Struct({
  id: Schema.String,
  laneId: Schema.optional(Schema.String),
  parentId: Schema.optional(Schema.String),
  title: Schema.String,
  rank: Schema.Number,
  completed: Schema.Boolean,
  collapsed: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  date: Schema.optional(Schema.String),
  attachments: Schema.optionalKey(Schema.Array(Attachment)),
});
export type Task = typeof Task.Type;

const AllowedNoteHref = Schema.String.check(
  Schema.makeFilter((href) => isAllowedNoteHref(href) || "Links must use http, https, or mailto."),
);

const NoteLinkMark = Schema.Struct({
  type: Schema.Literal("link"),
  attrs: Schema.Struct({
    href: AllowedNoteHref,
    target: Schema.NullOr(Schema.Literal("_blank")),
    rel: Schema.NullOr(Schema.Literal("noopener noreferrer")),
    class: Schema.Null,
    title: Schema.NullOr(Schema.String),
  }),
});

const NoteText = Schema.Struct({
  type: Schema.Literal("text"),
  marks: Schema.optionalKey(Schema.Array(NoteLinkMark)),
  text: Schema.String,
});

const NoteParagraph = Schema.Struct({
  type: Schema.Literal("paragraph"),
  content: Schema.optionalKey(Schema.Array(NoteText)),
});

const NoteHeading = Schema.Struct({
  type: Schema.Literal("heading"),
  attrs: Schema.Struct({ level: Schema.Literals([1, 2]) }),
  content: Schema.optionalKey(Schema.Array(NoteText)),
});

export type NoteBlock =
  | typeof NoteParagraph.Type
  | typeof NoteHeading.Type
  | NoteBulletList
  | NoteOrderedList;

type NoteListItem = {
  readonly type: "listItem";
  readonly content: ReadonlyArray<NoteBlock>;
};

type NoteBulletList = {
  readonly type: "bulletList";
  readonly content: ReadonlyArray<NoteListItem>;
};

type NoteOrderedList = {
  readonly type: "orderedList";
  readonly attrs: {
    readonly start: number;
    readonly type: "1" | "a" | "A" | "i" | "I" | null;
  };
  readonly content: ReadonlyArray<NoteListItem>;
};

const NoteBlock: Schema.Codec<NoteBlock> = Schema.suspend(() =>
  Schema.Union([NoteParagraph, NoteHeading, NoteBulletList, NoteOrderedList]),
);

const NoteListItem: Schema.Codec<NoteListItem> = Schema.Struct({
  type: Schema.Literal("listItem"),
  content: Schema.Array(NoteBlock),
});

const NoteBulletList: Schema.Codec<NoteBulletList> = Schema.Struct({
  type: Schema.Literal("bulletList"),
  content: Schema.Array(NoteListItem),
});

const NoteOrderedList: Schema.Codec<NoteOrderedList> = Schema.Struct({
  type: Schema.Literal("orderedList"),
  attrs: Schema.Struct({
    start: Schema.Int,
    type: Schema.NullOr(Schema.Literals(["1", "a", "A", "i", "I"])),
  }),
  content: Schema.Array(NoteListItem),
});

export const NoteDocument = Schema.Struct({
  type: Schema.Literal("doc"),
  content: Schema.Array(NoteBlock),
});
export type NoteDocument = typeof NoteDocument.Type;

export const Note = Schema.Struct({
  taskId: Schema.String,
  content: NoteDocument,
});
export type Note = typeof Note.Type;

export const Whiteboard = Schema.Struct({
  taskId: Schema.String,
  document: Schema.JsonObject,
});
export type Whiteboard = typeof Whiteboard.Type;

export const emptyNoteDocument = (): NoteDocument => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});

export function isAllowedNoteHref(href: string): boolean {
  try {
    const protocol = new URL(href).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:";
  } catch {
    return false;
  }
}

export type BoardTask = Task & {
  visualDepth: number;
};

export type BoardLane = Lane & {
  tasks: ReadonlyArray<BoardTask>;
};

export const laneSchema = Schema.toStandardSchemaV1(Lane);

export const taskSchema = Schema.toStandardSchemaV1(Task);

export const noteSchema: StandardSchemaV1<Note, Note> = Schema.toStandardSchemaV1(Note);

export const whiteboardSchema: StandardSchemaV1<Whiteboard, Whiteboard> =
  Schema.toStandardSchemaV1(Whiteboard);

const TaskFormValues = Schema.Struct({
  title: Schema.String.check(
    Schema.makeFilter((value) => value.trim() !== "" || "Enter a task title."),
  ),
  date: Schema.UndefinedOr(Schema.Date),
});
type TaskFormValues = typeof TaskFormValues.Type;

export const taskFormSchema = Schema.toStandardSchemaV1(TaskFormValues);
