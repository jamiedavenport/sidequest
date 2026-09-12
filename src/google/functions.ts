import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env as bindings } from "cloudflare:workers";
import { Effect, Schema } from "effect";
import { createAuth } from "~/auth/server";
import { assertBillingOrigin } from "~/billing/security";
import { TaskDate } from "~/board/date";
import { env } from "~/env";
import { serverRuntime } from "~/server/runtime";
import { captureTelemetryContext } from "~/telemetry/runtime";
import { getGoogleAccounts, hasCalendarAccess } from "./access";
import { calendarError, type CalendarSettings, type GoogleCalendarError } from "./schema";

const getCalendarUser = Effect.fn("getCalendarUser")(function* (mutation: boolean) {
  const headers = getRequestHeaders();
  if (mutation) {
    yield* Effect.try({
      try: () => assertBillingOrigin(headers, env.BETTER_AUTH_URL.href),
      catch: () => calendarError("Invalid request origin."),
    });
  }
  const session = yield* Effect.tryPromise({
    try: () => createAuth().api.getSession({ headers }),
    catch: () => calendarError("Could not check your session. Please retry."),
  });
  if (!session) {
    return yield* calendarError("Sign in to manage Calendar sync.");
  }
  return session.user.id;
});

const readCalendarSettings = Effect.fn("readCalendarSettings")(function* (): Effect.fn.Return<
  CalendarSettings,
  GoogleCalendarError
> {
  const userId = yield* getCalendarUser(false);
  const accounts = yield* getGoogleAccounts(userId);
  const status = yield* Effect.tryPromise({
    try: () =>
      bindings.BOARD.getByName(userId).getGoogleCalendarStatus(userId, captureTelemetryContext()),
    catch: () => calendarError("Could not read Calendar sync settings. Please retry."),
  });
  return {
    available: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    enabled: status.enabled,
    authorized: accounts.some(
      (entry) => (!status.accountId || entry.id === status.accountId) && hasCalendarAccess(entry),
    ),
    error: status.error,
  };
});

export const getGoogleCalendarSettings = createServerFn({ method: "GET" }).handler(() =>
  serverRuntime.runPromise(readCalendarSettings()),
);

const changeCalendarEnabled = Effect.fn("changeCalendarEnabled")(function* (enabled: boolean) {
  const userId = yield* getCalendarUser(true);
  const result = yield* Effect.tryPromise({
    try: () =>
      bindings.BOARD.getByName(userId).setGoogleCalendarEnabled(
        userId,
        enabled,
        captureTelemetryContext(),
      ),
    catch: () => calendarError("Could not change Calendar sync. Please retry."),
  });
  return { enabled: result.enabled, error: result.error };
});

export const setGoogleCalendarEnabled = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ enabled: Schema.Boolean })))
  .handler(({ data }) => serverRuntime.runPromise(changeCalendarEnabled(data.enabled)));

const migrateCalendarDates = Effect.fn("migrateCalendarDates")(function* (referenceDate: string) {
  const userId = yield* getCalendarUser(true);
  yield* Effect.tryPromise({
    try: () =>
      bindings.BOARD.getByName(userId).migrateDueDates(
        userId,
        referenceDate,
        captureTelemetryContext(),
      ),
    catch: () => calendarError("Could not convert existing due dates. Please retry."),
  });
});

export const migrateBoardDueDates = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ referenceDate: TaskDate })))
  .handler(({ data }) => serverRuntime.runPromise(migrateCalendarDates(data.referenceDate)));
