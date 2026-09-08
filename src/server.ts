import {
  captureTelemetryContext,
  trackResponse,
  annotateOperation,
  observeInvocation,
  requestTelemetryContext,
} from "~/telemetry/runtime";
import { env, waitUntil } from "cloudflare:workers";
import { handleMcpRoutes } from "~/mcp/http";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export { BoardObject } from "~/board/sync/server";

export default createServerEntry({
  async fetch(request) {
    return observeInvocation(
      env,
      waitUntil,
      getHttpOperation(request),
      async () => {
        const url = new URL(request.url);
        if (url.hostname === "www.sdqst.app") {
          url.hostname = "sdqst.app";
          return Response.redirect(url.href, 301);
        }

        // Router search normalization collapses repeated signed OAuth parameters. Keep the raw query intact.
        if (
          (url.pathname === "/login" || url.pathname === "/consent") &&
          url.searchParams.has("sig")
        ) {
          const oauthQuery = url.search.slice(1);
          url.search = new URLSearchParams({ oauthQuery }).toString();
          return Response.redirect(url.href, 302);
        }

        const mcpResponse = await handleMcpRoutes(request, env);
        const response = mcpResponse ?? (await handler.fetch(request));
        annotateOperation({
          status: response.status,
          outcome: getHttpOutcome(response.status),
        });
        return addResponseTelemetry(response);
      },
      requestTelemetryContext(request),
      { category: "http", component: "worker", method: request.method },
    );
  },
});

function getHttpOutcome(status: number) {
  if (status >= 500) {
    return "unexpected_failure";
  }
  if (status >= 400) {
    return "expected_rejection";
  }
  return "success";
}

function addResponseTelemetry(response: Response) {
  const telemetry = captureTelemetryContext();
  if (response.status !== 101 && telemetry) {
    const headers = new Headers(response.headers);
    headers.append(
      "server-timing",
      `traceparent;desc="${telemetry.traceparent}", operation;desc="${telemetry.operationId}"`,
    );
    return trackResponse(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }),
    );
  }
  return response;
}

function getHttpOperation(request: Request) {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/_serverFn/")) {
    return "http.serverFunction";
  }
  if (path.startsWith("/api/auth/")) {
    return "http.auth";
  }
  const routes: Record<string, string> = {
    "/": "board",
    "/login": "login",
    "/code": "code",
    "/consent": "consent",
    "/billing": "billing",
    "/connections": "connections",
    "/privacy": "privacy",
    "/cookies": "cookies",
    "/mcp": "mcp",
    "/api/telemetry": "telemetry",
    "/api/board": "sync",
    "/api/billing/webhook": "billingWebhook",
    "/api/github/webhook": "githubWebhook",
  };
  return `http.${routes[path] ?? "other"}`;
}
