import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  BoardMigrationError,
  currentBoardDataVersion,
  materializeTaskCollapse,
  runBoardMigrations,
  type BoardMigrationStore,
} from "~/board/data/migrations";

function migrationFixture(input: {
  version?: number;
  tasks: Array<{ collapsed?: boolean; id: string }>;
}) {
  let version = input.version;
  let materializeCount = 0;
  const store: BoardMigrationStore = {
    readVersion: () => Effect.succeed(version),
    materializeTaskCollapse: () =>
      Effect.sync(() => {
        materializeCount += 1;
        materializeTaskCollapse({
          toArray: input.tasks,
          update: (id, updater) => {
            const task = input.tasks.find((candidate) => candidate.id === id);
            if (task !== undefined) {
              updater(task);
            }
          },
        });
      }),
    writeVersion: (nextVersion) =>
      Effect.sync(() => {
        version = nextVersion;
      }),
  };

  return {
    materializeCount: () => materializeCount,
    store,
    version: () => version,
  };
}

describe("runBoardMigrations", () => {
  it("materializes collapsed=false without overwriting existing values", () => {
    const tasks = [
      { id: "legacy" },
      { id: "expanded", collapsed: false },
      { id: "collapsed", collapsed: true },
    ];
    const fixture = migrationFixture({ tasks });

    Effect.runSync(runBoardMigrations(fixture.store));

    expect(tasks).toEqual([
      { id: "legacy", collapsed: false },
      { id: "expanded", collapsed: false },
      { id: "collapsed", collapsed: true },
    ]);
    expect(fixture.version()).toBe(currentBoardDataVersion);
  });

  it("does not rerun an applied migration", () => {
    const fixture = migrationFixture({ tasks: [] });

    Effect.runSync(runBoardMigrations(fixture.store));
    Effect.runSync(runBoardMigrations(fixture.store));

    expect(fixture.materializeCount()).toBe(1);
  });

  it("does not advance the version when migration persistence fails", () => {
    let version: number | undefined;
    const store: BoardMigrationStore = {
      readVersion: () => Effect.succeed(version),
      materializeTaskCollapse: () =>
        Effect.fail(
          new BoardMigrationError({ cause: "write failed", operation: "materialize-collapse" }),
        ),
      writeVersion: (nextVersion) =>
        Effect.sync(() => {
          version = nextVersion;
        }),
    };

    const exit = Effect.runSyncExit(runBoardMigrations(store));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(version).toBeUndefined();
  });
});
