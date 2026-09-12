import { Effect } from "effect";
import { useEffect, useState } from "react";
import { getGoogleCalendarSettings } from "~/google/functions";
import { linkGoogleCalendar, saveCalendarEnabled } from "~/google/client";
import { calendarError, type CalendarSettings } from "~/google/schema";
import type { SettingAction } from "~/board/commands/results";

const loadCommandCalendar = Effect.fn("loadCommandCalendar")(() =>
  Effect.tryPromise({
    try: () => getGoogleCalendarSettings(),
    catch: () => calendarError("Could not load Calendar settings. Reopen search to retry."),
  }),
);

export function useCommandCalendar(open: boolean, userId: string) {
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const controller = new AbortController();
    setSettings(null);
    setLoading(true);
    setError(null);
    void Effect.runPromiseExit(
      loadCommandCalendar().pipe(
        Effect.tap((value) => Effect.sync(() => setSettings(value))),
        Effect.catch((failure) => Effect.sync(() => setError(failure.message))),
        Effect.ensuring(
          Effect.sync(() => {
            if (!controller.signal.aborted) {
              setLoading(false);
            }
          }),
        ),
      ),
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, [open]);
  const changeCalendar = Effect.fn("changeCommandCalendar")(function* (
    action: Exclude<SettingAction, "settings">,
  ) {
    if (!settings?.available) {
      return yield* calendarError("Calendar settings are unavailable. Reopen search to retry.");
    }
    if (action === "connect-google" || action === "reconnect-google") {
      yield* linkGoogleCalendar(userId);
      return undefined;
    }
    const next = yield* saveCalendarEnabled(action !== "disable-calendar");
    setSettings({ ...settings, ...next });
    if (next.error) {
      return yield* calendarError(next.error.message, next.error.reconnect);
    }
    return undefined;
  });
  return { settings, loading, error, changeCalendar };
}
