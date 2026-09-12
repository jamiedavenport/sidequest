import { Schema } from "effect";

export const calendarScope = "https://www.googleapis.com/auth/calendar.app.created";

export class GoogleCalendarError extends Schema.TaggedError<GoogleCalendarError>()(
  "GoogleCalendarError",
  {
    message: Schema.String,
    reconnect: Schema.Boolean,
    retryable: Schema.Boolean,
    status: Schema.optionalKey(Schema.Number),
  },
) {}

export function calendarError(
  message: string,
  reconnect = false,
  retryable = false,
  status?: number,
) {
  return new GoogleCalendarError({
    message,
    reconnect,
    retryable,
    ...(status === undefined ? {} : { status }),
  });
}

export type CalendarEvent = {
  summary: "🗓️ Sidequest";
  description: string;
  start: { date: string };
  end: { date: string };
  transparency: "transparent";
  reminders: { useDefault: false };
};

type SavedEvent = { id: string; content: CalendarEvent | null };

export type CalendarState = {
  enabled: true;
  accountId: string;
  calendarId: string;
  events: Record<string, SavedEvent>;
  error: { message: string; reconnect: boolean } | null;
};

export type CalendarSettings = {
  available: boolean;
  enabled: boolean;
  authorized: boolean;
  error: { message: string; reconnect: boolean } | null;
};
