import { Effect } from "effect";
import { useEffect, useState } from "react";
import { initializeCalendarSettings, linkGoogleCalendar, saveCalendarEnabled } from "./client";
import type { CalendarSettings } from "./schema";

export function useCalendarSettings(userId: string) {
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Effect.runPromise(
      initializeCalendarSettings(userId, controller.signal).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (!controller.signal.aborted) {
              setSettings(result.settings);
              setError(result.error);
            }
          }),
        ),
        Effect.catch((failure) =>
          Effect.sync(() => {
            if (!controller.signal.aborted) {
              setError(failure.message);
            }
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (!controller.signal.aborted) {
              setPending(false);
            }
          }),
        ),
      ),
    );
    return () => controller.abort();
  }, [userId]);

  const changeEnabled = Effect.fn("changeCalendarSetting")(
    function* (enabled: boolean, reconnect = false) {
      if (!settings || pending) {
        return;
      }
      setPending(true);
      setError(null);
      if (enabled && (!settings.authorized || reconnect)) {
        yield* linkGoogleCalendar(userId);
        return;
      }
      const result = yield* saveCalendarEnabled(enabled);
      setSettings({ ...settings, ...result });
    },
    Effect.catch((failure) => Effect.sync(() => setError(failure.message))),
    Effect.ensuring(Effect.sync(() => setPending(false))),
  );
  return { settings, pending, error: error ?? settings?.error?.message, changeEnabled };
}
