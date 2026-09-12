import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { createAuth } from "~/auth/server";
import { db } from "~/db/client";
import { account } from "~/db/schema";
import { calendarError, calendarScope } from "./schema";

export const getGoogleAccounts = Effect.fn("getGoogleAccounts")(function* (userId: string) {
  return yield* Effect.tryPromise({
    try: () =>
      db
        .select()
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "google"))),
    catch: () => calendarError("Could not read Google connection. Please retry."),
  });
});

export function hasCalendarAccess(linked: {
  scope: string | null;
  refreshToken: string | null;
}): boolean {
  // Better Auth persists scopes comma-separated; OAuth responses use spaces.
  return !!linked.refreshToken && (linked.scope?.split(/[,\s]+/).includes(calendarScope) ?? false);
}

export const getGoogleCalendarAccount = Effect.fn("getGoogleCalendarAccount")(function* (
  userId: string,
  accountId?: string,
) {
  const accounts = yield* getGoogleAccounts(userId);
  const linked = accounts.find(
    (entry) => (accountId === undefined || entry.id === accountId) && hasCalendarAccess(entry),
  );
  if (!linked) {
    return yield* calendarError("Reconnect Google to allow Calendar sync.", true);
  }
  return linked;
});

export const getGoogleCalendarToken = Effect.fn("getGoogleCalendarToken")(function* (
  userId: string,
  accountId: string,
) {
  yield* getGoogleCalendarAccount(userId, accountId);
  const result = yield* Effect.tryPromise({
    try: () => createAuth().api.getAccessToken({ body: { userId, accountId } }),
    catch: () => calendarError("Reconnect Google to allow Calendar sync.", true),
  });
  if (!result.accessToken) {
    return yield* calendarError("Reconnect Google to allow Calendar sync.", true);
  }
  return result.accessToken;
});
