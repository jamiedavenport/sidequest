import { Effect, Schema } from "effect";

import { Lane, Task } from "~/board/schema";

export const decodeLane = Effect.fn("decodeLane")(function* (input: unknown) {
  return yield* Schema.decodeUnknownEffect(Lane)(input);
});

export const decodeTask = Effect.fn("decodeTask")(function* (input: unknown) {
  return yield* Schema.decodeUnknownEffect(Task)(input);
});

export const decodeLaneSync = Schema.decodeUnknownSync(Lane);

export const decodeTaskSync = Schema.decodeUnknownSync(Task);
