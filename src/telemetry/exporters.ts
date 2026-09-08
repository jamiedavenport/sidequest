import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  Logger,
  Metric,
  Option,
  References,
  Tracer,
} from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientError,
  HttpClientResponse,
} from "effect/unstable/http";
import {
  OtlpExporter,
  OtlpLogger,
  OtlpMetrics,
  OtlpSerialization,
  OtlpTracer,
} from "effect/unstable/observability";
import { release } from "./release";
import { sanitizeAttributes } from "./schema";

export type TelemetryBindings = {
  TELEMETRY_ENABLED?: string;
  TELEMETRY_ENVIRONMENT?: string;
  TELEMETRY_RELEASE?: string;
  AXIOM_TOKEN?: string;
  AXIOM_ENDPOINT?: string;
  E2E_MODE?: string;
  BETTER_AUTH_URL?: string;
};

const duration = Metric.histogram("sidequest.operation.duration", {
  boundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  attributes: { unit: "s" },
});

const operations = Metric.counter("sidequest.operation.count");

export function diagnose(event: string, count = 1) {
  console.warn(JSON.stringify({ component: "telemetry", event, count }));
}

export function getTelemetryEnvironment(bindings: TelemetryBindings) {
  if (bindings.E2E_MODE === "1") {
    return "e2e";
  }
  if (bindings.TELEMETRY_ENVIRONMENT === "production") {
    return "production";
  }
  return "local";
}

export function getTelemetryRelease(bindings: TelemetryBindings) {
  if (bindings.TELEMETRY_RELEASE && bindings.TELEMETRY_RELEASE !== "unreleased") {
    return bindings.TELEMETRY_RELEASE;
  }
  return release;
}

export function shouldSampleTrace(bindings: TelemetryBindings, traceId: string) {
  if (getTelemetryEnvironment(bindings) !== "production") {
    return true;
  }
  return Number.parseInt(traceId.slice(-8), 16) / 0x100000000 < 0.1;
}

function getSpanOutcome(exit: Exit.Exit<unknown, unknown>, tag: string | undefined) {
  if (Exit.isSuccess(exit)) {
    return "success";
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    return "cancelled";
  }
  if (["BillingRequiredError", "ToolError", "SchemaError"].includes(tag ?? "")) {
    return "expected_rejection";
  }
  return "unexpected_failure";
}

function errorTag(exit: Exit.Exit<unknown, unknown>) {
  if (Exit.isSuccess(exit)) {
    return undefined;
  }
  const reason = exit.cause.reasons[0];
  const error = reason?._tag === "Fail" ? reason.error : undefined;
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string"
  ) {
    const tags = [
      "GitHubError",
      "SyncProtocolError",
      "BoardSeedError",
      "ToolError",
      "BillingRequiredError",
      "SessionValidationError",
      "SchemaError",
      "TimeoutError",
      "TelemetryBoundaryError",
    ];
    if (tags.includes(error._tag)) {
      return error._tag;
    }
  }
  return "UnexpectedError";
}

function makeExportTransport(exporting: boolean) {
  return Layer.effect(
    HttpClient.HttpClient,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      return HttpClient.make((request) => {
        if (!exporting) {
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })),
          );
        }
        return client.execute(request).pipe(
          Effect.timeout("750 millis"),
          Effect.tapError(() => Effect.sync(() => diagnose("export_failed"))),
          Effect.tap((response) =>
            Effect.sync(() => {
              if (response.status >= 400) {
                diagnose("export_failed");
              }
            }),
          ),
          Effect.mapError(
            () =>
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({
                  request,
                  cause: "Telemetry export failed",
                }),
              }),
          ),
        );
      });
    }),
  ).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, globalThis.fetch)),
  );
}

function makeSafeLogger(
  logger: Logger.Logger<unknown, void>,
  fields: Record<string, unknown>,
  exporting: boolean,
) {
  let records = 0;
  let completionRecords = 0;
  return Logger.make<unknown, void>((options) => {
    const first = Array.isArray(options.message) ? options.message[0] : options.message;
    const completion = first === "operation.completed";
    let count: number;
    if (completion) {
      count = ++completionRecords;
    } else {
      count = ++records;
    }
    if (count > maxRecords) {
      if (count === maxRecords + 1) {
        diagnose("records_dropped");
      }
      return;
    }
    const attributes = sanitizeAttributes({
      ...fields,
      ...options.fiber.getRef(References.CurrentLogAnnotations),
    });
    const fiber = new Proxy(options.fiber, {
      get(target, key) {
        if (key === "getRef") {
          return (ref: Context.Reference<unknown>) => {
            if (ref === References.CurrentLogAnnotations) {
              return attributes;
            }
            return target.getRef(ref);
          };
        }
        return Reflect.get(target, key);
      },
    });
    let message = "application.event";
    if (
      typeof first === "string" &&
      ["operation.completed", "sync.lifecycle", "browser.health"].includes(first)
    ) {
      message = first;
    }
    logger.log({ ...options, fiber, message: [message], cause: Cause.empty });
    if (!exporting) {
      console.info(JSON.stringify({ message, ...attributes }));
    }
  });
}

type SpanOptions = Parameters<Tracer.Tracer["span"]>[0];

type OperationSummary = { span: Tracer.Span; fields: Record<string, unknown> };

const maxRecords = 500;

function getOperationName(name: string) {
  if (/^[a-zA-Z][a-zA-Z0-9_.]{0,95}$/.test(name)) {
    return name;
  }
  return "internal";
}

function summarizeSpan(
  span: Tracer.Span,
  options: SpanOptions,
  endTime: bigint,
  exit: Exit.Exit<unknown, unknown>,
  fields: Record<string, unknown>,
) {
  const attributes = sanitizeAttributes(Object.fromEntries(span.attributes));
  const tag = errorTag(exit);
  const operation = getOperationName(span.name);
  let component = fields.component;
  if (typeof component !== "string") {
    component = "server";
  }
  const summary: Record<string, unknown> = {
    ...fields,
    ...attributes,
    operation,
    component: attributes.component ?? component,
    category: attributes.category ?? "internal",
    outcome: attributes.outcome ?? getSpanOutcome(exit, tag),
    durationSeconds: Number(endTime - options.startTime) / 1e9,
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: Option.getOrUndefined(options.parent)?.spanId,
    sampled: span.sampled,
  };
  if (tag) {
    summary.errorTag = tag;
    summary.fingerprint = `${operation}:${tag}`;
    summary.failureStage = operation;
  }
  return summary;
}

function queueSummary(
  summaries: OperationSummary[],
  summary: OperationSummary,
  completedSpans: number,
) {
  if (summaries.length < maxRecords) {
    summaries.push(summary);
    return;
  }
  // Prefer application operations over internal helpers when the invocation budget is exhausted.
  if (summary.fields.category !== "internal") {
    const index = summaries.findIndex((entry) => entry.fields.category === "internal");
    if (index >= 0) {
      summaries.splice(index, 1, summary);
    }
  }
  if (completedSpans === maxRecords) {
    diagnose("summaries_dropped");
  }
}

function recordSpanMetrics(
  summary: Record<string, unknown>,
  environment: string,
  services: Context.Context<never>,
) {
  const labels = {
    environment,
    component: String(summary.component),
    operation: String(summary.operation),
    outcome: String(summary.outcome),
  };
  operations.pipe(Metric.withAttributes(labels)).updateUnsafe(1, services);
  duration
    .pipe(Metric.withAttributes(labels))
    .updateUnsafe(Number(summary.durationSeconds), services);
}

function makeSafeTracer(
  otlp: Tracer.Tracer,
  context: Tracer.Tracer["context"],
  fields: Record<string, unknown>,
  environment: string,
  services: Context.Context<never>,
  summaries: OperationSummary[],
) {
  let completedSpans = 0;
  return Tracer.make({
    context,
    span(options) {
      const span = otlp.span({
        ...options,
        links: options.links.map((link) => ({
          span: link.span,
          attributes: sanitizeAttributes(link.attributes),
        })),
      });
      Object.assign(span, {
        name: getOperationName(options.name),
        traceId:
          Option.getOrUndefined(options.parent)?.traceId ?? crypto.randomUUID().replaceAll("-", ""),
        spanId: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
      });
      const attribute = span.attribute.bind(span);
      span.attribute = (key, value) => {
        for (const [name, safe] of Object.entries(sanitizeAttributes({ [key]: value }))) {
          attribute(name, safe);
        }
      };
      span.event = () => {};
      const end = span.end.bind(span);
      span.end = (endTime, exit) => {
        if (span.status._tag === "Ended") {
          return;
        }
        const summary = summarizeSpan(span, options, endTime, exit, fields);
        recordSpanMetrics(summary, environment, services);
        queueSummary(summaries, { span, fields: summary }, completedSpans);
        for (const [key, value] of Object.entries(sanitizeAttributes(summary))) {
          span.attribute(key, value);
        }
        completedSpans += 1;
        if (completedSpans > maxRecords) {
          Object.assign(span, {
            status: { _tag: "Ended", startTime: options.startTime, endTime, exit: Exit.void },
          });
          if (completedSpans === maxRecords + 1) {
            diagnose("spans_dropped");
          }
          return;
        }
        if (Exit.isFailure(exit)) {
          end(endTime, Exit.fail(errorTag(exit) ?? "UnexpectedError"));
          return;
        }
        end(endTime, Exit.void);
      };
      return span;
    },
  });
}

export function makeTelemetryLayer(
  bindings: TelemetryBindings,
  fields: Record<string, unknown>,
  context: Tracer.Tracer["context"],
) {
  const environment = getTelemetryEnvironment(bindings);
  const exporting =
    bindings.TELEMETRY_ENABLED === "true" && environment === "production" && !!bindings.AXIOM_TOKEN;
  const endpoint =
    bindings.AXIOM_ENDPOINT === "https://eu-central-1.aws.edge.axiom.co"
      ? bindings.AXIOM_ENDPOINT
      : "https://us-east-1.aws.edge.axiom.co";
  const resource = {
    serviceName: "sidequest",
    serviceVersion: getTelemetryRelease(bindings),
    attributes: { environment, schemaVersion: "1" },
  };
  const registry = new Map<string, Metric.Metric.Metadata<unknown, unknown>>();
  const base = Layer.mergeAll(
    OtlpSerialization.layerProtobuf,
    OtlpExporter.layerFlusher,
    Layer.succeed(Metric.MetricRegistry, registry),
  );
  return Layer.effectContext(
    Effect.gen(function* () {
      const services = yield* Effect.context();
      const common = {
        resource,
        exportInterval: "24 hours" as const,
        shutdownTimeout: "900 millis" as const,
        maxBatchSize: 1024,
      };
      const headers = { authorization: `Bearer ${bindings.AXIOM_TOKEN ?? "disabled"}` };
      const logger = yield* OtlpLogger.make({
        ...common,
        url: `${endpoint}/v1/logs`,
        headers: { ...headers, "x-axiom-dataset": "sidequest-logs" },
      });
      const otlp = yield* OtlpTracer.make({
        ...common,
        url: `${endpoint}/v1/traces`,
        headers: { ...headers, "x-axiom-dataset": "sidequest-traces" },
      });
      yield* OtlpMetrics.make({
        ...common,
        url: `${endpoint}/v1/metrics`,
        headers: { ...headers, "x-axiom-metrics-dataset": "sidequest-metrics" },
        temporality: "delta",
      });
      const summaries: OperationSummary[] = [];
      const safeLogger = makeSafeLogger(logger, fields, exporting);
      const tracer = makeSafeTracer(otlp, context, fields, environment, services, summaries);
      return Context.make(Tracer.Tracer, tracer).pipe(
        Context.add(Logger.CurrentLoggers, new Set([safeLogger])),
        Context.add(Metric.MetricRegistry, registry),
        Context.add(
          FlushSummaries,
          Effect.suspend(() =>
            Effect.forEach(
              summaries,
              (summary) =>
                Effect.logInfo("operation.completed").pipe(
                  Effect.annotateLogs(sanitizeAttributes(summary.fields)),
                  Effect.withParentSpan(summary.span),
                ),
              { discard: true },
            ),
          ),
        ),
      );
    }),
  ).pipe(Layer.provide(base), Layer.provide(makeExportTransport(exporting)));
}

export class FlushSummaries extends Context.Service<FlushSummaries, Effect.Effect<void>>()(
  "sidequest/telemetry/FlushSummaries",
) {}
