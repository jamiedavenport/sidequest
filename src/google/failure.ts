import { Schema } from "effect";
import { calendarError } from "./schema";

export const CalendarFailureResponse = Schema.Struct({
  error: Schema.Struct({
    errors: Schema.optionalKey(Schema.Array(Schema.Struct({ reason: Schema.String }))),
    details: Schema.optionalKey(
      Schema.Array(Schema.Struct({ reason: Schema.optionalKey(Schema.String) })),
    ),
  }),
});

export function classifyCalendarFailure(status: number, reasons: readonly string[]) {
  if (reasons.some((reason) => ["accessNotConfigured", "SERVICE_DISABLED"].includes(reason))) {
    return {
      reason: "api_disabled",
      error: calendarError(
        "Google Calendar API is disabled for this app. Please try again later.",
        false,
        false,
        status,
      ),
    };
  }
  const rateLimited =
    status === 429 ||
    reasons.some((reason) =>
      ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(reason),
    );
  if (rateLimited || status >= 500) {
    return {
      reason: rateLimited ? "rate_limited" : "server_error",
      error: calendarError(
        "Google Calendar is temporarily unavailable. Please retry.",
        false,
        true,
        status,
      ),
    };
  }
  if (status === 401 || reasons.includes("insufficientPermissions")) {
    return {
      reason: "authorization_required",
      error: calendarError("Reconnect Google to allow Calendar sync.", true, false, status),
    };
  }
  return {
    reason: "request_rejected",
    error: calendarError(
      "Google Calendar could not complete the request. Please retry.",
      false,
      false,
      status,
    ),
  };
}
