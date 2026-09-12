import { Effect } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/unstable/http";
import { expect, it, vi } from "vitest";
import { calendarClient } from "./api";
import { buildCalendarEvents } from "./events";
import { requestCalendar } from "./http";

const event = buildCalendarEvents({
  lanes: [],
  tasks: [{ id: "a", title: "A", rank: 0, completed: false, collapsed: false, date: "2026-09-12" }],
}).get("2026-09-12")!;

function run<A, E>(
  effect: Effect.Effect<A, E, HttpClient.HttpClient>,
  fetch: typeof globalThis.fetch,
) {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    ),
  );
}

function requestBody(body: BodyInit | null | undefined) {
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (typeof body === "string") {
    return body;
  }
  throw new Error("Expected JSON request body");
}

it("retries an ambiguous event insert with the same ID and updates it on conflict", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockRejectedValueOnce(new TypeError("Network response lost"))
    .mockResolvedValueOnce(new Response("{}", { status: 409 }))
    .mockResolvedValueOnce(new Response("{}"));
  await run(calendarClient.insertEvent("token", "calendar@example.test", "abc123", event), fetch);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.map((call) => call[1]?.method)).toEqual(["POST", "POST", "PUT"]);
  expect(
    fetch.mock.calls.slice(0, 2).map((call) => JSON.parse(requestBody(call[1]?.body)).id),
  ).toEqual(["abc123", "abc123"]);
});

it("retries Google rate limits three times and reports authorization without retrying", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }), {
        status: 403,
      }),
    ),
  );
  await expect(
    run(requestCalendar("token", "DELETE", "/calendars/calendar"), fetch),
  ).rejects.toThrow("temporarily unavailable");
  expect(fetch).toHaveBeenCalledTimes(4);
  fetch.mockClear().mockImplementation(() => Promise.resolve(new Response("{}", { status: 401 })));
  await expect(
    run(requestCalendar("token", "DELETE", "/calendars/calendar"), fetch),
  ).rejects.toThrow("Reconnect Google");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("treats an already deleted calendar as success and does not repeat ambiguous calendar creation", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response("{}", { status: 404 }))
    .mockRejectedValueOnce(new TypeError("Network lost"));
  await run(calendarClient.deleteCalendar("token", "calendar"), fetch);
  await expect(run(calendarClient.createCalendar("token"), fetch)).rejects.toThrow(
    "could not be reached",
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each(["accessNotConfigured", "SERVICE_DISABLED"])(
  "reports disabled Calendar API (%s) without sending the user back to consent",
  async (reason) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status: 403 }),
      );
    const failure = await run(
      requestCalendar("token", "POST", "/calendars", { summary: "Sidequest" }).pipe(Effect.flip),
      fetch,
    );
    expect(failure.message).toContain("Google Calendar API is disabled");
    expect(failure.reconnect).toBe(false);
    expect(failure.retryable).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it("still asks for consent when Calendar permissions are missing", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
    new Response(JSON.stringify({ error: { errors: [{ reason: "insufficientPermissions" }] } }), {
      status: 403,
    }),
  );
  const failure = await run(
    requestCalendar("token", "POST", "/calendars").pipe(Effect.flip),
    fetch,
  );
  expect(failure.reconnect).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
