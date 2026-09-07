import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createDatabase } from "~/db/database";

// Exercise the real Drizzle D1 driver against SQLite and the repository migrations.
export function createTestDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../../drizzle/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .toSorted()) {
    sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
  const binding = {
    prepare(query: string) {
      const statement = sqlite.prepare(query);
      return {
        bind(...values: SQLInputValue[]) {
          return {
            all: async () => ({ results: statement.all(...values) }),
            raw: async () => {
              statement.setReturnArrays(true);
              return statement.all(...values);
            },
            run: async () => ({ meta: { changes: Number(statement.run(...values).changes) } }),
          };
        },
      };
    },
  };
  // Only the D1 statement methods used by Drizzle are needed in this test adapter.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const DB = binding as unknown as D1Database;
  return { DB, db: createDatabase(DB), close: () => sqlite.close() };
}
