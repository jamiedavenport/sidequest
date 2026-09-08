import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect, Exit, ManagedRuntime, Option, Tracer } from "effect";
import { parseTelemetryContext, sanitizeAttributes, type TelemetryContext } from "./schema";
import {
  diagnose,
  FlushSummaries,
  getTelemetryEnvironment,
  getTelemetryRelease,
  makeTelemetryLayer,
  shouldSampleTrace,
  type TelemetryBindings,
} from "./exporters";

export type { TelemetryBindings } from "./exporters";

type Invocation = {
  services: Context.Context<never>;
  bindings: TelemetryBindings;
  parent?: Tracer.AnySpan;
  fields: Record<string, unknown>;
  lifetime: { completion?: Promise<void> };
};

const invocation = new AsyncLocalStorage<Invocation>();

export function captureTelemetryContext(): TelemetryContext | undefined {
  const current = invocation.getStore();
  const span = current?.parent;
  if (!span) {
    return undefined;
  }
  return parseTelemetryContext({
    version: 1,
    traceparent: `00-${span.traceId}-${span.spanId}-${span.sampled ? "01" : "00"}`,
    operationId: current.fields.operationId,
  });
}

export function annotateOperation(fields: Record<string, unknown>) {
  const current = invocation.getStore();
  if (!current) {
    return;
  }
  const attributes = sanitizeAttributes(fields);
  Object.assign(current.fields, attributes);
  if (current.parent?._tag === "Span") {
    for (const [key, value] of Object.entries(attributes)) {
      current.parent.attribute(key, value);
    }
  }
}

export function withInvocationContext<A, E, R>(effect: Effect.Effect<A, E, R>) {
  const current = invocation.getStore();
  if (!current) {
    return effect;
  }
  const contextual = Effect.provideContext(effect, current.services);
  if (current.parent) {
    return Effect.withParentSpan(contextual, current.parent);
  }
  return contextual;
}

const restoreInvocationSpan: Tracer.Tracer["context"] = (primitive, fiber) => {
  const current = invocation.getStore();
  if (!current) {
    return primitive["~effect/Effect/evaluate"](fiber);
  }
  return invocation.run({ ...current, parent: fiber.currentSpan }, () =>
    primitive["~effect/Effect/evaluate"](fiber),
  );
};

function createInvocationSpan(
  services: Context.Context<never>,
  bindings: TelemetryBindings,
  operation: string,
  incoming: TelemetryContext | undefined,
  attributes: Record<string, unknown>,
) {
  const traceId = incoming?.traceparent.split("-")[1] ?? crypto.randomUUID().replaceAll("-", "");
  const sampled = shouldSampleTrace(bindings, traceId);
  let producer: Tracer.ExternalSpan | undefined;
  if (incoming) {
    producer = Tracer.externalSpan({
      traceId,
      spanId: incoming.traceparent.split("-")[2]!,
      sampled,
    });
  }
  let parent = producer;
  const links: Tracer.SpanLink[] = [];
  if (attributes.category === "background") {
    parent = undefined;
    if (producer) {
      links.push({ span: producer, attributes: {} });
    }
  }
  const tracer = Context.get(services, Tracer.Tracer);
  const span = tracer.span({
    name: operation,
    parent: Option.fromUndefinedOr(parent),
    annotations: Context.empty(),
    links,
    startTime: BigInt(Date.now()) * 1_000_000n,
    kind: "server",
    root: !parent,
    sampled,
  });
  // With no incoming parent the OTLP tracer creates its own trace ID; sample against that ID.
  Object.assign(span, {
    sampled: shouldSampleTrace(bindings, span.traceId),
  });
  for (const [key, value] of Object.entries(sanitizeAttributes(attributes))) {
    span.attribute(key, value);
  }
  return span;
}

type TelemetryRuntime = ManagedRuntime.ManagedRuntime<FlushSummaries, never>;

async function closeExporters(runtime: TelemetryRuntime) {
  try {
    await runtime.runPromise(Effect.flatMap(FlushSummaries, (flush) => flush));
  } catch {
    diagnose("summary_failed");
  }
  try {
    await runtime.dispose();
  } catch {
    diagnose("shutdown_failed");
  }
}

async function finishInvocation(
  runtime: TelemetryRuntime,
  span: Tracer.Span,
  exit: Exit.Exit<unknown, unknown>,
  completion?: Promise<void>,
) {
  // Streaming responses keep their span open until the consumer finishes or cancels.
  if (completion) {
    try {
      await completion;
    } catch (error) {
      exit = Exit.fail(error);
    }
  }
  try {
    span.end(BigInt(Date.now()) * 1_000_000n, exit);
  } catch {
    diagnose("span_failed");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      closeExporters(runtime),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          diagnose("shutdown_timeout");
          resolve();
        }, 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function scheduleShutdown(
  closing: Promise<void>,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
) {
  if (!waitUntil) {
    await closing;
    return;
  }
  try {
    waitUntil(closing);
  } catch {
    diagnose("wait_until_failed");
    await closing;
  }
}

/** Framework boundary. Preserve the original value/error and hand exporter shutdown to the event owner. */
export async function observeInvocation<A>(
  bindings: TelemetryBindings,
  waitUntil: ((promise: Promise<unknown>) => void) | undefined,
  operation: string,
  work: () => Promise<A>,
  input?: TelemetryContext,
  attributes: Record<string, unknown> = {},
): Promise<A> {
  if (
    bindings.BETTER_AUTH_URL &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(bindings.BETTER_AUTH_URL)
  ) {
    bindings = { ...bindings, TELEMETRY_ENVIRONMENT: bindings.E2E_MODE === "1" ? "e2e" : "local" };
  }
  const fields = {
    ...sanitizeAttributes(attributes),
    environment: getTelemetryEnvironment(bindings),
    release: getTelemetryRelease(bindings),
    schemaVersion: "1",
    requestId: crypto.randomUUID(),
    operationId: parseTelemetryContext(input)?.operationId ?? crypto.randomUUID(),
  };
  const runtime = ManagedRuntime.make(makeTelemetryLayer(bindings, fields, restoreInvocationSpan));
  let services: Context.Context<never>;
  try {
    services = await runtime.context();
  } catch {
    diagnose("initialization_failed");
    return work();
  }
  const span = createInvocationSpan(
    services,
    bindings,
    operation,
    parseTelemetryContext(input),
    attributes,
  );
  const current: Invocation = { services, bindings, parent: span, fields, lifetime: {} };
  let exit: Exit.Exit<unknown, unknown> = Exit.void;
  try {
    return await invocation.run(current, work);
  } catch (error) {
    exit = Exit.fail(error);
    throw error;
  } finally {
    const closing = finishInvocation(runtime, span, exit, current.lifetime.completion);
    await scheduleShutdown(closing, waitUntil);
  }
}

export function observeBackground<A>(
  operation: string,
  work: () => Promise<A>,
  producer = captureTelemetryContext(),
) {
  const current = invocation.getStore();
  return observeInvocation(current?.bindings ?? {}, undefined, operation, work, producer, {
    component: "background",
    category: "background",
  });
}

export async function observeOperation<A>(
  operation: string,
  work: () => Promise<A>,
  attributes: Record<string, unknown> = {},
): Promise<A> {
  const current = invocation.getStore();
  if (!current) {
    return work();
  }
  const span = Context.get(current.services, Tracer.Tracer).span({
    name: operation,
    parent: Option.fromUndefinedOr(current.parent),
    annotations: Context.empty(),
    links: [],
    startTime: BigInt(Date.now()) * 1_000_000n,
    kind: "internal",
    root: false,
    sampled: current.parent?.sampled ?? true,
  });
  for (const [key, value] of Object.entries(sanitizeAttributes(attributes))) {
    span.attribute(key, value);
  }
  let exit: Exit.Exit<unknown, unknown> = Exit.void;
  try {
    return await invocation.run({ ...current, parent: span }, work);
  } catch (error) {
    exit = Exit.fail(error);
    throw error;
  } finally {
    span.end(BigInt(Date.now()) * 1_000_000n, exit);
  }
}

export function requestTelemetryContext(request: Request) {
  return parseTelemetryContext({
    version: 1,
    traceparent: request.headers.get("traceparent"),
    operationId: request.headers.get("x-sidequest-operation-id") ?? crypto.randomUUID(),
  });
}

export const recordBrowserSpan = Effect.fn("recordBrowserSpan")(function* (
  record: import("./schema").BrowserRecord,
) {
  const context = parseTelemetryContext(record.telemetry);
  if (
    !context ||
    ![
      "rpc_completed",
      "acknowledgement_applied",
      "acknowledgement_timeout",
      "acknowledgement_error",
      "snapshot_applied",
      "changes_applied",
    ].includes(record.event)
  ) {
    return;
  }
  const current = invocation.getStore();
  if (!current) {
    return;
  }
  const traceId = context.traceparent.split("-")[1]!;
  const sampled = shouldSampleTrace(current.bindings, traceId);
  const durationMs =
    typeof record.details.durationMs === "number"
      ? Math.max(0, Math.min(record.details.durationMs, 300_000))
      : 0;
  const link = parseTelemetryContext(record.link);
  const links: Tracer.SpanLink[] = [];
  if (link) {
    links.push({
      span: Tracer.externalSpan({
        traceId: link.traceparent.split("-")[1]!,
        spanId: link.traceparent.split("-")[2]!,
      }),
      attributes: {},
    });
  }
  const tracer = yield* Tracer.Tracer;
  const span = tracer.span({
    name: `browser.${record.event}`,
    parent: Option.none(),
    annotations: Context.empty(),
    links,
    startTime: BigInt(Math.floor(record.time - durationMs)) * 1_000_000n,
    kind: "client",
    root: true,
    sampled,
  });
  Object.assign(span, { traceId, spanId: context.traceparent.split("-")[2]! });
  for (const [key, value] of Object.entries(
    sanitizeAttributes({
      ...record.details,
      component: "browser",
      category: "browser",
      operationId: context.operationId,
    }),
  )) {
    span.attribute(key, value);
  }
  span.end(BigInt(Math.floor(record.time)) * 1_000_000n, Exit.void);
});

/** Keep the invocation alive until the consumer finishes or cancels, without buffering the response. */
export function trackResponse(response: Response): Response {
  const current = invocation.getStore();
  if (!current || !response.body || response.status === 101) {
    return response;
  }
  const completion = Promise.withResolvers<void>();
  current.lifetime.completion = completion.promise;
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await invocation.run(current, () => reader.read());
        if (chunk.done) {
          controller.close();
          completion.resolve();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        controller.error(error);
        completion.reject(error);
      }
    },
    async cancel(reason) {
      if (current.parent?._tag === "Span") {
        current.parent.attribute("outcome", "cancelled");
      }
      try {
        await reader.cancel(reason);
      } finally {
        completion.resolve();
      }
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
