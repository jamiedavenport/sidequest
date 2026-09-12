// Cloudflare storage and collections are controlled migration fixtures.
// oxlint-disable typescript/no-unsafe-type-assertion
import { Effect } from "effect";
import { expect, it } from "vitest";
import type { BoardStore } from "~/board/sync/store";
import { migrateTaskDates, taskDateMigrationKey } from "./date-migration";

it("migrates once and keeps the first browser reference when interrupted before its marker", async () => {
  const values = new Map<string, unknown>();
  let failMarker = true;
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      if (key === taskDateMigrationKey && failMarker) {
        throw new Error("Interrupted");
      }
      values.set(key, value);
    },
  } as unknown as DurableObjectStorage;
  const tasks = [
    { id: "today", date: "Today" },
    { id: "yearless", date: "1 Jan" },
    { id: "canonical", date: "2020-01-01" },
    { id: "unknown", date: "not a date" },
  ];
  let commits = 0;
  const board = {
    tasks: {
      toArray: tasks,
      update: (id: string, update: (draft: { date: string }) => void) =>
        update(tasks.find((task) => task.id === id)!),
    },
    persist: (mutate: () => void) =>
      Effect.sync(() => {
        commits++;
        mutate();
      }),
  } as unknown as BoardStore;
  await expect(Effect.runPromise(migrateTaskDates(storage, board, "2026-12-31"))).rejects.toThrow();
  failMarker = false;
  await Effect.runPromise(migrateTaskDates(storage, board, "2027-01-01"));
  expect(tasks.map((task) => task.date)).toEqual([
    "2026-12-31",
    "2026-01-01",
    "2020-01-01",
    "not a date",
  ]);
  expect(values.get(taskDateMigrationKey)).toBe(true);
  await Effect.runPromise(migrateTaskDates(storage, board, "2028-01-01"));
  expect(commits).toBe(1);
});
