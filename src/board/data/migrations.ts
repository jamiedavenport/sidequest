import { Effect, Schema } from "effect";

export const currentBoardDataVersion = 2;

const initialBoardDataVersion = 1;

export class BoardMigrationError extends Schema.TaggedError<BoardMigrationError>()(
  "BoardMigrationError",
  {
    cause: Schema.Defect(),
    operation: Schema.String,
  },
) {}

export type BoardMigrationStore = {
  readVersion: () => Effect.Effect<number | undefined, BoardMigrationError>;
  materializeTaskCollapse: () => Effect.Effect<void, BoardMigrationError>;
  writeVersion: (version: number) => Effect.Effect<void, BoardMigrationError>;
};

export function materializeTaskCollapse(tasks: {
  toArray: ReadonlyArray<{ id: string; collapsed?: boolean }>;
  update: (id: string, updater: (draft: { collapsed?: boolean }) => void) => void;
}): void {
  for (const task of tasks.toArray) {
    // Persisted rows bypass schema decoding, including its defaults.
    if (task.collapsed === undefined) {
      tasks.update(task.id, (draft) => {
        draft.collapsed = false;
      });
    }
  }
}

const migrations: ReadonlyMap<
  number,
  (store: BoardMigrationStore) => Effect.Effect<void, BoardMigrationError>
> = new Map([[2, (store) => store.materializeTaskCollapse()]]);

export const runBoardMigrations = Effect.fn("runBoardMigrations")(function* (
  store: BoardMigrationStore,
) {
  let version = (yield* store.readVersion()) ?? initialBoardDataVersion;
  if (version > currentBoardDataVersion) {
    return yield* new BoardMigrationError({
      cause: `Board data version ${version} is newer than supported version ${currentBoardDataVersion}`,
      operation: "validate-version",
    });
  }

  while (version < currentBoardDataVersion) {
    const nextVersion = version + 1;
    const migrate = migrations.get(nextVersion);
    if (migrate === undefined) {
      return yield* new BoardMigrationError({
        cause: `Missing board data migration for version ${nextVersion}`,
        operation: "resolve-migration",
      });
    }

    yield* migrate(store);
    yield* store.writeVersion(nextVersion);
    version = nextVersion;
  }

  return undefined;
});
