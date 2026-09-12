// Cloudflare storage is represented by this controlled in-memory fixture.
// oxlint-disable typescript/no-unsafe-type-assertion
import { Effect } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/unstable/http";
import { expect, it } from "vitest";
import type { Task } from "~/board/schema";
import type { CalendarClient } from "./api";
import { calendarError, type CalendarEvent, type GoogleCalendarError } from "./schema";
import { CalendarStore } from "./store";
import { GoogleCalendarSync } from "./sync";

function run<A>(effect: Effect.Effect<A, GoogleCalendarError, HttpClient.HttpClient>) {
  return Effect.runPromise(effect.pipe(Effect.provide(FetchHttpClient.layer)));
}

function fixture() {
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => structuredClone(values.get(key)),
    put: async (key: string, value: unknown) => {
      values.set(key, structuredClone(value));
    },
    delete: async (key: string) => values.delete(key),
  } as unknown as DurableObjectStorage;
  const store = new CalendarStore(storage);
  const data = {
    tasks: [
      { id: "a", title: "Task", date: "2026-09-12", rank: 0, collapsed: false, completed: false },
    ] as Task[],
    created: 0,
    updated: 0,
    insertedIds: [] as string[],
    deleted: [] as string[],
    failInsert: false,
    failDelete: false,
    migrated: true,
    authorized: true,
    beforeUpdate: undefined as (() => Promise<void>) | undefined,
  };
  const events = new Map<string, CalendarEvent>();
  const client: CalendarClient = {
    createCalendar: () => Effect.sync(() => `calendar-${++data.created}`),
    insertEvent: (_token, _calendar, id, event) =>
      Effect.gen(function* () {
        // Google can commit an insert even when its response never arrives.
        data.insertedIds.push(id);
        events.set(id, event);
        if (data.failInsert) {
          return yield* calendarError("Unavailable", false, true);
        }
        return undefined;
      }),
    updateEvent: (_token, _calendar, id, event) =>
      Effect.gen(function* () {
        if (data.beforeUpdate) {
          yield* Effect.promise(data.beforeUpdate);
        }
        data.updated++;
        events.set(id, event);
      }),
    deleteEvent: (_token, _calendar, id) =>
      Effect.sync(() => {
        events.delete(id);
      }),
    deleteCalendar: (_token, calendar) =>
      Effect.gen(function* () {
        if (data.failDelete) {
          return yield* calendarError("Delete failed");
        }
        data.deleted.push(calendar);
        events.clear();
        return undefined;
      }),
  };
  const createSync = () =>
    new GoogleCalendarSync({
      client,
      store,
      readBoard: () => Effect.succeed({ tasks: data.tasks, lanes: [] }),
      getAccount: () =>
        data.authorized
          ? Effect.succeed({ id: "account" })
          : Effect.fail(calendarError("Reconnect", true)),
      getToken: () => Effect.succeed("token"),
      datesMigrated: () => Effect.succeed(data.migrated),
    });
  return { data, events, store, sync: createSync(), createSync };
}

it("enables, updates renamed paths, reschedules and removes empty dates", async () => {
  const { data, events, sync } = fixture();
  expect((await run(sync.getStatus())).enabled).toBe(false);
  await run(sync.setEnabled("user", true));
  expect(data.created).toBe(1);
  expect(events.size).toBe(1);
  data.tasks = data.tasks.map((task) => ({ ...task, title: "Renamed" }));
  await run(sync.reconcile("user"));
  expect(data.updated).toBe(1);
  expect([...events.values()][0]?.description).toBe("• Inbox > Renamed");
  data.tasks = data.tasks.map((task) => ({ ...task, date: "2026-09-13" }));
  await run(sync.reconcile("user"));
  expect(events.size).toBe(1);
  expect([...events.values()][0]?.start.date).toBe("2026-09-13");
  data.tasks = [];
  await run(sync.reconcile("user"));
  expect(events.size).toBe(0);
});

it("removes completed tasks, deletes empty day events and restores reopened tasks", async () => {
  const { data, events, store, sync } = fixture();
  data.tasks.push({
    id: "b",
    title: "Other task",
    date: "2026-09-12",
    rank: 1,
    collapsed: false,
    completed: false,
  });
  await run(sync.setEnabled("user", true));
  const [eventId] = events.keys();
  data.tasks = data.tasks.map((task) => ({ ...task, completed: task.id === "b" }));
  await run(sync.reconcile("user"));
  expect(data.updated).toBe(1);
  expect([...events.keys()]).toEqual([eventId]);
  expect([...events.values()][0]?.description).toBe("• Inbox > Task");
  data.tasks = data.tasks.map((task) => ({ ...task, completed: true }));
  await run(sync.reconcile("user"));
  expect(events.size).toBe(0);
  expect((await run(store.read()))?.events).toEqual({});
  data.tasks = data.tasks.map((task) => ({ ...task, completed: task.id === "b" }));
  await run(sync.reconcile("user"));
  expect(events.size).toBe(1);
  expect([...events.values()][0]?.description).toBe("• Inbox > Task");
});

it("persists calendar and pending event IDs and retries after restart without duplicates", async () => {
  const { data, events, store, sync, createSync } = fixture();
  data.failInsert = true;
  expect((await run(sync.setEnabled("user", true))).error?.message).toBe("Unavailable");
  const saved = await run(store.read());
  expect(saved?.calendarId).toBe("calendar-1");
  expect(saved?.events["2026-09-12"]?.content).toBeNull();
  data.failInsert = false;
  await run(createSync().reconcile("user"));
  expect(data.created).toBe(1);
  expect(new Set(data.insertedIds).size).toBe(1);
  expect(events.size).toBe(1);
  expect((await run(store.read()))?.error).toBeNull();
});

it("retains state after failed deletion and creates a fresh calendar on re-enable", async () => {
  const { data, store, sync } = fixture();
  await run(sync.setEnabled("user", true));
  data.failDelete = true;
  expect((await run(sync.setEnabled("user", false))).enabled).toBe(true);
  expect((await run(store.read()))?.calendarId).toBe("calendar-1");
  data.failDelete = false;
  await run(sync.setEnabled("user", false));
  expect(await run(store.read())).toBeUndefined();
  await run(sync.setEnabled("user", true));
  expect((await run(store.read()))?.calendarId).toBe("calendar-2");
});

it("serializes disable after in-flight sync and prevents later work from recreating events", async () => {
  const { data, events, sync } = fixture();
  await run(sync.setEnabled("user", true));
  let release!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  data.beforeUpdate = () => {
    started();
    return blocked;
  };
  data.tasks = data.tasks.map((task) => ({ ...task, title: "Changed" }));
  const syncing = run(sync.reconcile("user"));
  await startedPromise;
  const disabling = run(sync.setEnabled("user", false));
  expect(data.deleted).toEqual([]);
  release();
  await Promise.all([syncing, disabling]);
  await run(sync.reconcile("user"));
  expect(data.deleted).toEqual(["calendar-1"]);
  expect(events.size).toBe(0);
});

it("keeps sync off until dates are migrated and offline Calendar permission is granted", async () => {
  const { data, sync } = fixture();
  data.migrated = false;
  expect((await run(sync.setEnabled("user", true))).enabled).toBe(false);
  data.migrated = true;
  data.authorized = false;
  expect((await run(sync.setEnabled("user", true))).error?.reconnect).toBe(true);
  expect(data.created).toBe(0);
});
