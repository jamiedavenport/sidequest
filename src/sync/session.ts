import { and, eq, inArray } from "drizzle-orm";
import { Array, Clock, Effect, Schema } from "effect";

import { createDatabase } from "~/db/database";
import { session } from "~/db/schema/auth";

export const SocketSession = Schema.Struct({
  version: Schema.Literal(2),
  userId: Schema.NonEmptyString,
  sessionId: Schema.NonEmptyString,
});

class SessionCheckError extends Schema.TaggedError<SessionCheckError>()("SessionCheckError", {}) {}

// Read fresh rows for each operation/delivery; attachments never cache expiry or credentials.
export const getValidSessions = Effect.fn("getValidSessions")(function* (
  binding: D1Database,
  userId: string,
  sessionIds: ReadonlyArray<string>,
) {
  const db = createDatabase(binding);
  const rows = yield* Effect.forEach(Array.chunksOf([...new Set(sessionIds)], 90), (ids) =>
    Effect.tryPromise({
      try: () =>
        db
          .select({ id: session.id, expiresAt: session.expiresAt })
          .from(session)
          .where(and(eq(session.userId, userId), inArray(session.id, ids))),
      catch: () => new SessionCheckError(),
    }),
  );
  const now = yield* Clock.currentTimeMillis;
  return new Set(
    rows
      .flat()
      .filter((row) => row.expiresAt.getTime() > now)
      .map((row) => row.id),
  );
});
