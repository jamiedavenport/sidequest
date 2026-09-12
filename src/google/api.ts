import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { requestCalendar } from "./http";
import { calendarError, type CalendarEvent, type GoogleCalendarError } from "./schema";

type CalendarOperation<A> = Effect.Effect<A, GoogleCalendarError, HttpClient.HttpClient>;

export type CalendarClient = {
  createCalendar(token: string): CalendarOperation<string>;
  deleteCalendar(token: string, calendarId: string): CalendarOperation<void>;
  insertEvent(
    token: string,
    calendarId: string,
    id: string,
    event: CalendarEvent,
  ): CalendarOperation<void>;
  updateEvent(
    token: string,
    calendarId: string,
    id: string,
    event: CalendarEvent,
  ): CalendarOperation<void>;
  deleteEvent(token: string, calendarId: string, id: string): CalendarOperation<void>;
};

function calendarPath(calendarId: string): string {
  return `/calendars/${encodeURIComponent(calendarId)}`;
}

function eventPath(calendarId: string, id: string): string {
  return `${calendarPath(calendarId)}/events/${encodeURIComponent(id)}`;
}

const updateEvent = Effect.fn("updateCalendarEvent")(function* (
  token: string,
  calendarId: string,
  id: string,
  event: CalendarEvent,
) {
  yield* requestCalendar(token, "PUT", eventPath(calendarId, id), event);
});

export const calendarClient: CalendarClient = {
  createCalendar: Effect.fn("createGoogleCalendar")(function* (token) {
    const result = yield* requestCalendar(token, "POST", "/calendars", { summary: "Sidequest" });
    if (!result) {
      return yield* calendarError("Google Calendar did not return a calendar ID.");
    }
    return result.id;
  }),
  deleteCalendar: Effect.fn("deleteGoogleCalendar")(function* (token, calendarId) {
    yield* requestCalendar(token, "DELETE", calendarPath(calendarId));
  }),
  insertEvent: Effect.fn("insertCalendarEvent")(function* (token, calendarId, id, event) {
    yield* requestCalendar(token, "POST", `${calendarPath(calendarId)}/events`, {
      ...event,
      id,
    }).pipe(
      Effect.catch((error) => {
        if (error.status === 409) {
          return updateEvent(token, calendarId, id, event);
        }
        return Effect.fail(error);
      }),
    );
  }),
  updateEvent,
  deleteEvent: Effect.fn("deleteCalendarEvent")(function* (token, calendarId, id) {
    yield* requestCalendar(token, "DELETE", eventPath(calendarId, id));
  }),
};
