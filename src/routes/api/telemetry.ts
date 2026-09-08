import { readBillingAccess } from "~/billing/store";
import { canWrite } from "~/billing/access";
import { annotateOperation, recordBrowserSpan } from "~/telemetry/runtime";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Effect, Metric, Schema, Tracer } from "effect";
import { createAuth } from "~/auth/server";
import { serverRuntime } from "~/server/runtime";
import { BrowserBatch, type BrowserRecord, sanitizeAttributes } from "~/telemetry/schema";

class BrowserBatchError extends Schema.TaggedError<BrowserBatchError>()("BrowserBatchError", {
  status: Schema.Number,
}) {}

const anonymousEvents = new Set<BrowserRecord["event"]>([
  "boot",
  "global_error",
  "render_error",
  "unhandled_rejection",
  "rpc_completed",
  "navigation",
  "web_vital",
]);

const serverOwnedFields = [
  "canWrite",
  "accountId",
  "boardId",
  "release",
  "environment",
  "schemaVersion",
  "component",
  "category",
  "requestId",
];

const webVitalMetrics = {
  LCP: Metric.histogram("sidequest.browser.lcp", {
    boundaries: [0.005, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    attributes: { component: "browser", unit: "s" },
  }),
  INP: Metric.histogram("sidequest.browser.inp", {
    boundaries: [0.005, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    attributes: { component: "browser", unit: "s" },
  }),
  CLS: Metric.histogram("sidequest.browser.cls", {
    boundaries: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
    attributes: { component: "browser", unit: "1" },
  }),
};

const readBrowserBatch = Effect.fn("readBrowserBatch")(function* (request: Request) {
  const reader = request.body?.getReader();
  if (!reader) {
    return yield* new BrowserBatchError({ status: 400 });
  }
  let size = 0;
  let body = "";
  const decoder = new TextDecoder();
  while (true) {
    const chunk = yield* Effect.tryPromise(() => reader.read());
    if (chunk.done) {
      break;
    }
    size += chunk.value.byteLength;
    if (size > 65536) {
      yield* Effect.tryPromise(() => reader.cancel());
      return yield* new BrowserBatchError({ status: 413 });
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();
  return yield* Effect.try(() =>
    Schema.decodeUnknownSync(Schema.fromJsonString(BrowserBatch))(body),
  );
});

const getBatchWriteAccess = Effect.fn("getBatchWriteAccess")(function* (
  records: ReadonlyArray<BrowserRecord>,
  accountId: string | undefined,
) {
  if (!accountId) {
    return undefined;
  }
  const hasPendingOnlineEdits = records.some(
    (record) =>
      record.event === "outbox_observation" &&
      record.details.online === true &&
      Number(record.details.pendingCount) > 0,
  );
  if (!hasPendingOnlineEdits) {
    return undefined;
  }
  return yield* Effect.tryPromise(() => readBillingAccess(env.DB, accountId)).pipe(
    Effect.map(canWrite),
    Effect.catch(() => Effect.void),
  );
});

const measureBrowserRecord = Effect.fn("measureBrowserRecord")(function* (record: BrowserRecord) {
  yield* Metric.update(
    Metric.counter("sidequest.browser.event", {
      attributes: { component: "browser", operation: record.event },
    }),
    1,
  );
  const { metric, value } = record.details;
  if (record.event === "web_vital" && typeof value === "number") {
    if (metric === "LCP" || metric === "INP" || metric === "CLS") {
      yield* Metric.update(webVitalMetrics[metric], value);
    }
  }
  yield* recordBrowserSpan(record);
});

function recordBrowserHealth(
  record: BrowserRecord,
  accountId: string | undefined,
  writeAccess: boolean | void,
) {
  if (!accountId && !anonymousEvents.has(record.event)) {
    return Effect.void;
  }
  if (record.time < Date.now() - 300_000 || record.time > Date.now() + 60_000) {
    return Effect.void;
  }

  const details = sanitizeAttributes(record.details);
  // Identity, deployment and category always come from the server.
  for (const key of serverOwnedFields) {
    delete details[key];
  }
  if (record.event === "outbox_observation" && writeAccess !== undefined) {
    details.canWrite = writeAccess;
  }
  const fields: Record<string, unknown> = {
    ...details,
    event: record.event,
    reportingSession: record.reportingSession,
    component: "browser",
    category: "browser",
  };
  if (accountId) {
    fields.accountId = accountId;
  }
  const log = measureBrowserRecord({ ...record, details }).pipe(
    Effect.andThen(Effect.logInfo("browser.health")),
    Effect.annotateLogs(fields),
  );
  const parts = record.telemetry?.traceparent.split("-");
  if (!parts) {
    return log;
  }
  return log.pipe(
    Effect.withParentSpan(
      Tracer.externalSpan({ traceId: parts[1]!, spanId: parts[2]!, sampled: false }),
    ),
  );
}

const receiveBrowserBatch = Effect.fn("receiveBrowserBatch")(
  function* (request: Request) {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return new Response(null, { status: 403 });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return new Response(null, { status: 415 });
    }
    const limit = yield* Effect.tryPromise(() =>
      env.TELEMETRY_RATE_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "local" }),
    );
    if (!limit.success) {
      return new Response(null, { status: 429 });
    }

    const batch = yield* readBrowserBatch(request);
    const session = yield* Effect.tryPromise(() =>
      createAuth().api.getSession({ headers: request.headers }),
    );
    const accountId = session?.user.id;
    if (accountId) {
      annotateOperation({ accountId });
    }
    const writeAccess = yield* getBatchWriteAccess(batch.records, accountId);
    yield* Effect.forEach(
      batch.records,
      (record) => recordBrowserHealth(record, accountId, writeAccess),
      { discard: true },
    );
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  },
  Effect.catchTag("BrowserBatchError", (error) =>
    Effect.succeed(new Response(null, { status: error.status })),
  ),
  Effect.catch(() => Effect.succeed(new Response(null, { status: 400 }))),
);

export const Route = createFileRoute("/api/telemetry")({
  server: {
    handlers: { POST: ({ request }) => serverRuntime.runPromise(receiveBrowserBatch(request)) },
  },
});
