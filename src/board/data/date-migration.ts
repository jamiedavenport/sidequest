import { Effect, Schema } from "effect";
import { convertLegacyTaskDate, parseTaskDate, TaskDate } from "~/board/date";
import type { BoardStore } from "~/board/sync/store";
import { SyncProtocolError } from "~/sync/protocol";

export const taskDateMigrationKey = "board:canonical-dates";

const referenceKey = "board:date-migration-reference";

const storeDateMigration = Effect.fn("storeDateMigration")(<A>(work: () => Promise<A>) =>
  Effect.tryPromise({
    try: work,
    catch: () => new SyncProtocolError({ message: "Could not migrate due dates. Please retry." }),
  }),
);

/** Caller holds the board serialization boundary. Persist the reference before any changes. */
export const migrateTaskDates = Effect.fn("migrateTaskDates")(function* (
  storage: DurableObjectStorage,
  board: { tasks: BoardStore["tasks"]; persist: OmitThisParameter<BoardStore["persist"]> },
  reference: string,
) {
  yield* Schema.decodeUnknownEffect(TaskDate)(reference).pipe(
    Effect.mapError(() => new SyncProtocolError({ message: "Invalid local reference date." })),
  );
  if (yield* storeDateMigration(() => storage.get<boolean>(taskDateMigrationKey))) {
    return false;
  }
  const savedReference = yield* storeDateMigration(() => storage.get<string>(referenceKey));
  const referenceDate = parseTaskDate(savedReference ?? reference)!;
  yield* storeDateMigration(() => storage.put(referenceKey, savedReference ?? reference));
  const updates = board.tasks.toArray.flatMap((task) => {
    if (task.date === undefined) {
      return [];
    }
    const date = convertLegacyTaskDate(task.date, referenceDate);
    return date === task.date ? [] : [{ id: task.id, date }];
  });
  if (updates.length > 0) {
    yield* board.persist(() => {
      for (const { id, date } of updates) {
        board.tasks.update(id, (draft) => {
          draft.date = date;
        });
      }
    }, "migrate_task_dates");
  }
  yield* storeDateMigration(() => storage.put(taskDateMigrationKey, true));
  return updates.length > 0;
});
