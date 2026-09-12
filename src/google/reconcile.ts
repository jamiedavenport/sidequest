import { Effect } from "effect";
import type { CalendarClient } from "./api";
import { sameCalendarEvent } from "./events";
import type { CalendarEvent, CalendarState } from "./schema";
import type { CalendarStore } from "./store";

const syncCalendarDate = Effect.fn("syncCalendarDate")(function* (
  client: CalendarClient,
  store: CalendarStore,
  state: CalendarState,
  token: string,
  date: string,
  content: CalendarEvent,
) {
  let saved = state.events[date];
  if (saved && sameCalendarEvent(saved.content, content)) {
    return;
  }
  yield* Effect.annotateCurrentSpan({ date, calendarId: state.calendarId });
  if (!saved) {
    // UUID hex is valid Google base32hex; persist the ID before the first attempt.
    saved = { id: crypto.randomUUID().replaceAll("-", ""), content: null };
    state.events[date] = saved;
    yield* store.save(state);
  }
  if (saved.content === null) {
    yield* client.insertEvent(token, state.calendarId, saved.id, content);
  } else {
    yield* client.updateEvent(token, state.calendarId, saved.id, content);
  }
  state.events[date] = { id: saved.id, content };
  yield* store.save(state);
});

export const reconcileCalendar = Effect.fn("reconcileCalendar")(function* (
  client: CalendarClient,
  store: CalendarStore,
  state: CalendarState,
  token: string,
  desired: Map<string, CalendarEvent>,
) {
  yield* Effect.annotateCurrentSpan({ calendarId: state.calendarId, dateCount: desired.size });
  yield* Effect.forEach(
    [...desired],
    ([date, content]) => syncCalendarDate(client, store, state, token, date, content),
    { concurrency: 1, discard: true },
  );
  yield* Effect.forEach(
    Object.entries(state.events).filter(([date]) => !desired.has(date)),
    Effect.fn("removeObsoleteCalendarDate")(function* ([date, saved]) {
      yield* client.deleteEvent(token, state.calendarId, saved.id);
      delete state.events[date];
      yield* store.save(state);
    }),
    { concurrency: 1, discard: true },
  );
  state.error = null;
  yield* store.save(state);
});
