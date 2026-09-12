import { Effect } from "effect";
import { authClient } from "~/auth/client";
import { serializeTaskDate } from "~/board/date";
import {
  getGoogleCalendarSettings,
  migrateBoardDueDates,
  setGoogleCalendarEnabled,
} from "./functions";
import { calendarError, calendarScope } from "./schema";

const calendarConsentKey = "sidequest:calendar-consent";

const loadCalendarSettings = Effect.fn("loadCalendarSettings")(function* () {
  yield* Effect.tryPromise({
    try: () => migrateBoardDueDates({ data: { referenceDate: serializeTaskDate(new Date()) } }),
    catch: () => calendarError("Could not convert existing due dates. Reload settings to retry."),
  });
  return yield* Effect.tryPromise({
    try: () => getGoogleCalendarSettings(),
    catch: () => calendarError("Could not load Calendar settings. Reload to retry."),
  });
});

export const saveCalendarEnabled = Effect.fn("saveCalendarEnabled")((enabled: boolean) =>
  Effect.tryPromise({
    try: () => setGoogleCalendarEnabled({ data: { enabled } }),
    catch: () =>
      calendarError("Could not change Calendar sync. Reload settings to check its status."),
  }),
);

export const linkGoogleCalendar = Effect.fn("linkGoogleCalendar")(function* (userId: string) {
  sessionStorage.setItem(calendarConsentKey, userId);
  const result = yield* Effect.tryPromise({
    try: () =>
      authClient.linkSocial({
        provider: "google",
        scopes: [calendarScope],
        callbackURL: "/settings?calendar=connected",
        errorCallbackURL: "/settings?calendar=cancelled",
        additionalParams: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
        },
      }),
    catch: () => calendarError("Google connection could not be started. Please retry."),
  });
  if (result.error) {
    return yield* calendarError("Google connection could not be started. Please retry.");
  }
  return undefined;
});

export const initializeCalendarSettings = Effect.fn("initializeCalendarSettings")(function* (
  userId: string,
  signal: AbortSignal,
) {
  let settings = yield* loadCalendarSettings();
  if (signal.aborted) {
    return { settings, error: null };
  }
  const callback = new URLSearchParams(window.location.search).get("calendar");
  const requested = sessionStorage.getItem(calendarConsentKey) === userId;
  if (callback) {
    sessionStorage.removeItem(calendarConsentKey);
    window.history.replaceState(window.history.state, "", "/settings");
  }
  if (callback === "connected" && requested) {
    settings = { ...settings, ...(yield* saveCalendarEnabled(true)) };
  }
  const error =
    callback === "cancelled"
      ? "Google authorization was cancelled. Calendar settings are unchanged."
      : null;
  return { settings, error };
});
