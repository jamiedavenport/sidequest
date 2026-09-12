import { Effect, Schedule, Schema } from "effect";
import { HttpClient, HttpClientRequest, type HttpClientResponse } from "effect/unstable/http";
import { calendarError, type GoogleCalendarError } from "./schema";
import { CalendarFailureResponse, classifyCalendarFailure } from "./failure";

const calendarRequestTimeoutMs = 30_000;

const calendarRetryCount = 3;

const calendarRetryDelayMs = 250;

const readCalendarFailure = Effect.fn("readCalendarFailure")(function* (
  response: HttpClientResponse.HttpClientResponse,
) {
  const body = yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(CalendarFailureResponse)),
    Effect.catch(() => Effect.succeed(null)),
  );
  const reasons = [
    ...(body?.error.errors?.map(({ reason }) => reason) ?? []),
    ...(body?.error.details?.flatMap(({ reason }) => (reason ? [reason] : [])) ?? []),
  ];
  const failure = classifyCalendarFailure(response.status, reasons);
  yield* Effect.logWarning("google.calendar_request_rejected").pipe(
    Effect.annotateLogs({ provider: "google", status: response.status, errorTag: failure.reason }),
  );
  return failure.error;
});

const attemptCalendarRequest = Effect.fn("attemptCalendarRequest")(function* (
  token: string,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: object,
) {
  const client = yield* HttpClient.HttpClient;
  let request = HttpClientRequest.make(method)(
    `https://www.googleapis.com/calendar/v3${path}`,
  ).pipe(HttpClientRequest.bearerToken(token), HttpClientRequest.acceptJson);
  if (body) {
    request = request.pipe(HttpClientRequest.bodyJsonUnsafe(body));
  }
  const response = yield* client.execute(request).pipe(
    Effect.provideService(HttpClient.TracerPropagationEnabled, false),
    Effect.mapError(() =>
      calendarError("Google Calendar could not be reached. Please retry.", false, true),
    ),
  );
  yield* Effect.annotateCurrentSpan({ provider: "google", status: response.status, method });
  if (method === "DELETE" && [404, 410].includes(response.status)) {
    return undefined;
  }
  if (response.status < 200 || response.status >= 300) {
    const failure = yield* readCalendarFailure(response);
    return yield* failure;
  }
  if (method === "DELETE" || path.includes("/events")) {
    return undefined;
  }
  return yield* response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ id: Schema.NonEmptyString }))),
    Effect.mapError(() => calendarError("Google Calendar returned an unexpected response.")),
  );
});

export const requestCalendar = Effect.fn("requestCalendar")(
  (token: string, method: "POST" | "PUT" | "DELETE", path: string, body?: object) =>
    attemptCalendarRequest(token, method, path, body).pipe(
      Effect.timeout(calendarRequestTimeoutMs),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(calendarError("Google Calendar timed out. Please retry.", false, true)),
      ),
      Effect.retry({
        times: calendarRetryCount,
        schedule: Schedule.exponential(calendarRetryDelayMs),
        // Calendar inserts have no idempotency key. Only retry a definite rate-limit rejection.
        while: (error: GoogleCalendarError) =>
          error.retryable &&
          (path !== "/calendars" || error.status === 429 || error.status === 403),
      }),
    ),
);
