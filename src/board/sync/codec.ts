import { Effect, Predicate, Schema } from "effect";

import { Lane, Note, Task, Whiteboard } from "~/board/schema";

export const decodeLane = Effect.fn("decodeLane")(function* (input: unknown) {
  return yield* Schema.decodeUnknownEffect(Lane)(input);
});

const decodeTask = Effect.fn("decodeTask")(function* (input: unknown) {
  return yield* Schema.decodeUnknownEffect(Task)(input);
});

export const decodeTaskMutation = Effect.fn("decodeTaskMutation")(function* (
  input: unknown,
  existing?: Task,
) {
  const task = yield* decodeTask(input);
  // The client can neither create nor replace the server's GitHub identity.
  const attachments = [
    ...(task.attachments ?? existing?.attachments ?? []).filter(
      (attachment) => attachment.type === "link",
    ),
    ...(existing?.attachments ?? []).filter((attachment) => attachment.type === "github-issue"),
  ];
  return {
    ...task,
    ...(attachments.length > 0 || task.attachments !== undefined ? { attachments } : {}),
    ...(existing !== undefined && !Predicate.hasProperty(input, "collapsed")
      ? { collapsed: existing.collapsed }
      : {}),
  };
});

export const decodeNote = Effect.fn("decodeNote")(function* (input: unknown) {
  return yield* Schema.decodeUnknownEffect(Note)(input);
});

export const decodeWhiteboard = Effect.fn("decodeWhiteboard")(function* (input: unknown) {
  return yield* Schema.decodeUnknownEffect(Whiteboard)(input);
});

export const decodeLaneSync = Schema.decodeUnknownSync(Lane);

export const decodeTaskSync = Schema.decodeUnknownSync(Task);

export const decodeNoteSync = Schema.decodeUnknownSync(Note);

export const decodeWhiteboardSync = Schema.decodeUnknownSync(Whiteboard);
