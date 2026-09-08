import { reportBrowserEvent } from "~/telemetry/browser";
import { createMiddleware, createStart } from "@tanstack/react-start";
import { createServerOnlyFn } from "@tanstack/react-start";
import { createTelemetryContext } from "~/telemetry/schema";

const observeServerFunction = createServerOnlyFn(
  async <A>(name: string, work: () => Promise<A>) => {
    const { observeOperation } = await import("~/telemetry/runtime");
    return observeOperation(name, work, { category: "rpc", component: "start" });
  },
);

const telemetry = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const context = createTelemetryContext();
    const startedAt = Date.now();
    try {
      const result = await next({
        headers: {
          traceparent: context.traceparent,
          "x-sidequest-operation-id": context.operationId,
        },
      });
      reportBrowserEvent(
        "rpc_completed",
        { durationMs: Date.now() - startedAt, outcome: "success" },
        context,
      );
      return result;
    } catch (error) {
      reportBrowserEvent(
        "rpc_completed",
        { durationMs: Date.now() - startedAt, outcome: "unexpected_failure" },
        context,
      );
      throw error;
    }
  })
  .server(({ next, serverFnMeta }) => observeServerFunction(serverFnMeta.name, next));

export const startInstance = createStart(() => ({ functionMiddleware: [telemetry] }));
