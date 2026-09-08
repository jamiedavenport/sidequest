import { DateTime, Effect, Option, Schema } from "effect";

import { Lane, Note, Task, Whiteboard } from "~/board/schema";
import { isSystemLane } from "~/board/views";
import { ExcalidrawDocument } from "~/board/whiteboard-document";

export class BoardSeedError extends Schema.TaggedError<BoardSeedError>()("BoardSeedError", {
  message: Schema.String,
}) {}

export const SeedAnchorDate = Schema.String.check(
  Schema.makeFilter((value) => {
    const parsed = DateTime.make(value);
    return (
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Option.isSome(parsed) &&
        DateTime.formatIsoDateUtc(parsed.value) === value) ||
      "Use a valid YYYY-MM-DD anchor date."
    );
  }),
);

export const SeedOptions = Schema.Struct({
  seed: Schema.optionalKey(Schema.Literals(["empty", "onboarding", "demo"])),
  anchorDate: Schema.optionalKey(SeedAnchorDate),
});
export type SeedOptions = typeof SeedOptions.Type;

export const BoardSeed = Schema.Struct({
  profile: Schema.Literals(["onboarding", "demo"]),
  version: Schema.Literal(1),
  lanes: Schema.Array(Lane),
  tasks: Schema.Array(Task),
  notes: Schema.Array(Note),
  whiteboards: Schema.Array(Schema.Struct({ ...Whiteboard.fields, document: ExcalidrawDocument })),
}).check(
  Schema.makeFilter((seed) => {
    const lanes = new Set(seed.lanes.map((lane) => lane.id));
    const tasks = new Map(seed.tasks.map((task) => [task.id, task]));
    if (
      lanes.size !== seed.lanes.length ||
      tasks.size !== seed.tasks.length ||
      seed.lanes.some((lane) => !lane.id || isSystemLane(lane) || !Number.isFinite(lane.rank)) ||
      seed.tasks.some((task) => !task.id || lanes.has(task.id) || !Number.isFinite(task.rank))
    ) {
      return "Seed IDs must be unique and nonempty, with finite ranks and no system lanes.";
    }
    for (const task of seed.tasks) {
      if (task.laneId !== undefined && !lanes.has(task.laneId)) {
        return "Unknown seed lane.";
      }
      if (task.date !== undefined && !Schema.is(SeedAnchorDate)(task.date)) {
        return "Invalid seed task date.";
      }
      const seen = new Set([task.id]);
      let parentId = task.parentId;
      while (parentId !== undefined) {
        const parent = tasks.get(parentId);
        if (!parent || seen.has(parentId)) {
          return "Invalid seed task hierarchy.";
        }
        if (
          parent.laneId !== task.laneId ||
          parent.date !== task.date ||
          (parent.completed && !task.completed) ||
          parent.rank >= task.rank
        ) {
          return "Nested seed tasks must follow their parent's placement, order and completion.";
        }
        seen.add(parentId);
        parentId = parent.parentId;
      }
    }
    if (
      seed.notes.length !== tasks.size ||
      new Set(seed.notes.map((note) => note.taskId)).size !== tasks.size ||
      seed.notes.some((note) => !tasks.has(note.taskId))
    ) {
      return "Every seed task needs exactly one note.";
    }
    if (
      new Set(seed.whiteboards.map((board) => board.taskId)).size !== seed.whiteboards.length ||
      seed.whiteboards.some(
        (board) => !tasks.has(board.taskId) || tasks.get(board.taskId)?.completed,
      )
    ) {
      return "Seed whiteboards need unique active tasks.";
    }
    const attachments = seed.tasks.flatMap((task) => task.attachments ?? []);
    return (
      (new Set(attachments.map((attachment) => attachment.id)).size === attachments.length &&
        attachments.every((attachment) => attachment.id && attachment.type === "link")) ||
      "Invalid seed attachments."
    );
  }),
);
export type BoardSeed = typeof BoardSeed.Type;

export const validateBoardSeed = Effect.fn("validateBoardSeed")((input: unknown) =>
  Schema.decodeUnknownEffect(BoardSeed, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError((error) => new BoardSeedError({ message: error.message })),
  ),
);
