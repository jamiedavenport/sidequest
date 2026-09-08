import { Schema } from "effect";

const identifier = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_.:-]{1,128}$/));

const traceparent = Schema.String.check(
  Schema.isPattern(/^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-[0-9a-f]{2}$/),
);

export const TelemetryContext = Schema.Struct({
  version: Schema.Literal(1),
  traceparent,
  operationId: identifier,
});
export type TelemetryContext = typeof TelemetryContext.Type;

export function parseTelemetryContext(input: unknown): TelemetryContext | undefined {
  const parsed = Schema.decodeUnknownOption(TelemetryContext)(input);
  return parsed._tag === "Some" ? parsed.value : undefined;
}

export function createTelemetryContext(): TelemetryContext {
  return {
    version: 1,
    traceparent: `00-${crypto.randomUUID().replaceAll("-", "")}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}-01`,
    operationId: crypto.randomUUID(),
  };
}

const numericFields = new Set([
  "code",
  "durationMs",
  "durationSeconds",
  "status",
  "rowCount",
  "mutationCount",
  "collectionCount",
  "socketCount",
  "failedSocketCount",
  "sentSocketCount",
  "taskCount",
  "updateCount",
  "retryAttempt",
  "pendingCount",
  "pendingAgeMs",
  "queueWaitMs",
  "snapshotBytes",
  "processingAgeMs",
  "rateLimitRemaining",
  "value",
  "protocolVersion",
]);

const identifierFields = new Set([
  "accountId",
  "boardId",
  "requestId",
  "operationId",
  "transactionId",
  "changeId",
  "originatingTransactionId",
  "enrichmentId",
  "eventId",
  "deliveryId",
  "upstreamRequestId",
  "traceId",
  "spanId",
  "parentSpanId",
  "reportingSession",
  "fingerprint",
]);

const labelFields = new Set([
  "clientRelease",
  "component",
  "operation",
  "category",
  "provider",
  "environment",
  "release",
  "schemaVersion",
  "outcome",
  "event",
  "errorTag",
  "failureStage",
  "method",
  "browser",
  "metric",
  "source",
  "eventType",
  "storage",
]);

/** Apply to every signal, including automatic HTTP attributes. Never serialize arbitrary causes. */
export function sanitizeAttributes(input: Record<string, unknown>) {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (numericFields.has(key) && typeof value === "number" && Number.isFinite(value)) {
      result[key] = Math.max(0, Math.min(value, 1e12));
    } else if (
      (identifierFields.has(key) || labelFields.has(key)) &&
      typeof value === "string" &&
      /^[a-zA-Z0-9_.:-]{1,128}$/.test(value)
    ) {
      result[key] = value;
    } else if (
      ["online", "retryable", "sampled", "canWrite", "persistentStorage"].includes(key) &&
      typeof value === "boolean"
    ) {
      result[key] = value;
    } else if (key === "collections" && typeof value === "string") {
      result[key] = value
        .split(",")
        .filter((name) => ["lanes", "tasks", "notes", "whiteboards"].includes(name))
        .join(",");
    } else if (key === "mutationTypes" && typeof value === "string") {
      result[key] = value
        .split(",")
        .filter((name) => ["insert", "update", "delete"].includes(name))
        .join(",");
    }
  }
  return result;
}

export const BrowserRecord = Schema.Struct({
  event: Schema.Literals([
    "boot",
    "rpc_completed",
    "render_error",
    "global_error",
    "unhandled_rejection",
    "navigation",
    "web_vital",
    "mutation_send_error",
    "acknowledgement_timeout",
    "acknowledgement_applied",
    "acknowledgement_error",
    "mutation_sent",
    "socket_open",
    "sync_request_sent",
    "message_decode_error",
    "changes_received",
    "snapshot_received",
    "message_application_error",
    "socket_close",
    "acknowledgement_received",
    "acknowledgement_rejected",
    "collection_commit",
    "snapshot_applied",
    "changes_applied",
    "storage_initialized",
    "storage_failed",
    "outbox_observation",
    "outbox_drained",
    "storage_fallback",
  ]),
  time: Schema.Number.check(Schema.isFinite()),
  reportingSession: identifier,
  telemetry: Schema.optionalKey(TelemetryContext),
  link: Schema.optionalKey(TelemetryContext),
  details: Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Number, Schema.Boolean]),
  ),
});
export type BrowserRecord = typeof BrowserRecord.Type;

export const BrowserBatch = Schema.Struct({
  records: Schema.Array(BrowserRecord).check(Schema.isMaxLength(50)),
});
