import { Effect, Schema } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { serverRuntime } from "~/server/runtime";
import {
  captureTelemetryContext,
  observeInvocation,
  withInvocationContext,
  trackResponse,
} from "./runtime";
import { createTelemetryContext, parseTelemetryContext, sanitizeAttributes } from "./schema";
import { decodeClientMessage } from "~/sync/protocol";

class SensitiveError extends Schema.TaggedError<SensitiveError>()("SensitiveError", {
  message: Schema.String,
}) {}

afterEach(() => vi.restoreAllMocks());

it("keeps overlapping account invocations and nested Promise callbacks in their original trace", async () => {
  const logs = vi.spyOn(console, "info").mockImplementation(() => {});
  const child = Effect.fn("childOperation")(function* () {
    return yield* Effect.tryPromise(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return serverRuntime.runPromise(Effect.sync(captureTelemetryContext));
    });
  });
  const contexts = [createTelemetryContext(), createTelemetryContext()];
  const values = await Promise.all(
    contexts.map((context, index) =>
      observeInvocation(
        {},
        undefined,
        "testRequest",
        () => serverRuntime.runPromise(child()),
        context,
        { accountId: `account-${index}`, category: "http" },
      ),
    ),
  );
  for (const [index, value] of values.entries()) {
    expect(value?.traceparent.split("-")[1]).toBe(contexts[index]?.traceparent.split("-")[1]);
  }
  const summaries = logs.mock.calls
    .map(([line]) => JSON.parse(String(line)))
    .filter((line) => line.message === "operation.completed");
  expect(summaries.filter((line) => line.operation === "testRequest")).toHaveLength(2);
  expect(summaries.filter((line) => line.operation === "childOperation")).toHaveLength(2);
  for (const line of summaries) {
    expect(line.traceId).toBe(
      contexts[line.accountId === "account-0" ? 0 : 1]?.traceparent.split("-")[1],
    );
  }
});

it("does not export sensitive annotations or exception causes", async () => {
  const logs = vi.spyOn(console, "info").mockImplementation(() => {});
  const failing = Effect.logError("SECRET_MESSAGE").pipe(
    Effect.annotateLogs({ authorization: "SECRET_TOKEN", accountId: "account-1" }),
    Effect.andThen(Effect.fail(new SensitiveError({ message: "SECRET_CAUSE" }))),
  );
  await expect(
    observeInvocation({}, undefined, "failedOperation", () =>
      Effect.runPromise(withInvocationContext(failing)),
    ),
  ).rejects.toBeDefined();
  const serialized = JSON.stringify(logs.mock.calls);
  expect(serialized).not.toContain("SECRET");
  expect(serialized).toContain("unexpected_failure");
  expect(
    sanitizeAttributes({
      "url.full": "https://host/?token=SECRET",
      sessionId: "SECRET",
      rowCount: 2,
    }),
  ).toEqual({ rowCount: 2 });
});

it("ignores malformed optional telemetry without rejecting old sync messages", () => {
  expect(
    parseTelemetryContext({
      version: 1,
      traceparent: "00-00000000000000000000000000000000-0000000000000000-01",
      operationId: "test",
    }),
  ).toBeUndefined();
  for (const telemetry of [undefined, null, "invalid", { traceparent: "malformed" }]) {
    expect(
      Effect.runSync(
        decodeClientMessage({ _tag: "Mutate", transactionId: "test", mutations: [], telemetry }),
      )._tag,
    ).toBe("Mutate");
  }
});

it("retains stream bytes and waits for completion before emitting the HTTP summary", async () => {
  const logs = vi.spyOn(console, "info").mockImplementation(() => {});
  const pending: Promise<unknown>[] = [];
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = await observeInvocation(
    {},
    (promise) => pending.push(promise),
    "http.stream",
    async () =>
      trackResponse(
        new Response(
          new ReadableStream({
            start(controller) {
              stream = controller;
            },
          }),
        ),
      ),
  );
  expect(logs).not.toHaveBeenCalled();
  stream?.enqueue(new TextEncoder().encode("first"));
  stream?.enqueue(new TextEncoder().encode("second"));
  stream?.close();
  expect(await response.text()).toBe("firstsecond");
  await Promise.all(pending);
  expect(
    logs.mock.calls.filter(([line]) => String(line).includes('"operation":"http.stream"')),
  ).toHaveLength(1);
});

it("exports unsampled diagnostics and isolated delta metrics as Protobuf without private causes", async () => {
  const packets: Array<{ dataset: string | null; body: string; contentType: string | null }> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    packets.push({
      dataset:
        request.headers.get("x-axiom-dataset") ?? request.headers.get("x-axiom-metrics-dataset"),
      body: new TextDecoder().decode(await request.arrayBuffer()),
      contentType: request.headers.get("content-type"),
    });
    return new Response(null, { status: 200 });
  });
  try {
    await expect(
      observeInvocation(
        { TELEMETRY_ENABLED: "true", TELEMETRY_ENVIRONMENT: "production", AXIOM_TOKEN: "fake" },
        undefined,
        "failedRequest",
        () =>
          serverRuntime.runPromise(Effect.fail(new SensitiveError({ message: "SECRET_CAUSE" }))),
        {
          version: 1,
          traceparent: `00-${"f".repeat(32)}-${"1".repeat(16)}-01`,
          operationId: "attempt",
        },
        { accountId: "private-account", category: "http" },
      ),
    ).rejects.toBeDefined();
    expect(
      packets.map((packet) => packet.dataset).toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
    ).toEqual(["sidequest-logs", "sidequest-metrics"]);
    expect(packets.every((packet) => packet.contentType === "application/x-protobuf")).toBe(true);
    expect(packets.map((packet) => packet.body).join()).not.toContain("SECRET_CAUSE");
    expect(packets.find((packet) => packet.dataset === "sidequest-logs")?.body).toContain(
      "unexpected_failure",
    );
    const metrics = packets.find((packet) => packet.dataset === "sidequest-metrics")?.body;
    expect(metrics).toContain("sidequest.operation.count");
    expect(metrics).not.toContain("private-account");
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each([429, 503])(
  "bounds shutdown during exporter HTTP %s failures without changing the result",
  async (status) => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      async () => new Response(null, { status, headers: { "retry-after": "300" } }),
    );
    const startedAt = Date.now();
    try {
      expect(
        await observeInvocation(
          { TELEMETRY_ENABLED: "true", TELEMETRY_ENVIRONMENT: "production", AXIOM_TOKEN: "fake" },
          undefined,
          "healthyRequest",
          async () => "healthy",
        ),
      ).toBe("healthy");
      expect(Date.now() - startedAt).toBeLessThan(3200);
      expect(warnings.mock.calls.some(([line]) => String(line).includes("export_failed"))).toBe(
        true,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
