import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { Predicate } from "effect";
import { auth } from "~/auth/server";
import { env as appEnv } from "~/env";
import { serveMcp } from "~/mcp/protocol";
import { isWriteTool, isToolName, mcpEnabled, type ToolName, type ToolReply } from "~/mcp/schema";

function challenge(resource: string, status: 401 | 403, write = false) {
  const metadata = new URL("/.well-known/oauth-protected-resource/mcp", resource).href;
  return Response.json(
    { error: status === 401 ? "invalid_token" : "insufficient_scope" },
    {
      status,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${metadata}", error="${status === 401 ? "invalid_token" : "insufficient_scope"}", scope="sidequest:read${write ? " sidequest:write" : ""}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}

type McpBindings = {
  MCP_ENABLED: string;
  MCP_ALLOWED_ORIGINS: string;
  BOARD: {
    getByName(name: string): {
      callTool(clientId: string, name: ToolName, args: unknown): Promise<ToolReply>;
    };
  };
};

export async function handleMcpRoutes(
  request: Request,
  env: McpBindings,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  const discovery =
    path === "/.well-known/oauth-protected-resource/mcp" ||
    path === "/.well-known/oauth-protected-resource";
  const authorizationMetadata =
    path === "/.well-known/oauth-authorization-server/api/auth" ||
    path === "/.well-known/oauth-authorization-server";
  const oauth = path.startsWith("/api/auth/oauth2/") || path.startsWith("/api/auth/admin/oauth2/");
  if (path !== "/mcp" && !discovery && !authorizationMetadata && !oauth) return undefined;
  if (!mcpEnabled(env.MCP_ENABLED)) return new Response("Not found", { status: 404 });
  const resource = new URL("/mcp", appEnv.BETTER_AUTH_URL).href;
  const origin = request.headers.get("origin");
  const allowed = new Set([
    appEnv.BETTER_AUTH_URL.origin,
    ...env.MCP_ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ]);
  if (origin !== null && !allowed.has(origin))
    return new Response("Origin is not allowed", { status: 403 });
  const cors = (response: Response) => {
    if (origin !== null) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Vary", "Origin");
      response.headers.set(
        "Access-Control-Expose-Headers",
        "WWW-Authenticate, MCP-Protocol-Version",
      );
    }
    return response;
  };
  if (request.method === "OPTIONS")
    return cors(
      new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
          "Access-Control-Max-Age": "600",
        },
      }),
    );
  if (discovery)
    return cors(
      Response.json({
        resource,
        authorization_servers: [new URL("/api/auth", appEnv.BETTER_AUTH_URL).href],
        scopes_supported: ["sidequest:read", "sidequest:write"],
        bearer_methods_supported: ["header"],
        resource_name: "Sidequest",
      }),
    );
  if (authorizationMetadata) return cors(await oauthProviderAuthServerMetadata(auth)(request));
  if (oauth) return cors(await auth.handler(request));
  let token;
  try {
    token = await auth.api.validateMcpToken({ headers: request.headers });
  } catch {
    return cors(challenge(resource, 401));
  }
  const audience = Array.isArray(token.aud) ? token.aud : [token.aud];
  if (
    !token.sub ||
    typeof token.client_id !== "string" ||
    !audience.includes(resource) ||
    token.cnf
  )
    return cors(challenge(resource, 401));
  const scopes = typeof token.scope === "string" ? token.scope.split(" ") : [];
  if (!scopes.includes("sidequest:read")) return cors(challenge(resource, 403));
  const canWrite = scopes.includes("sidequest:write");
  if (request.method !== "POST")
    return cors(
      new Response("Use POST; SSE and sessions are not supported.", {
        status: 405,
        headers: { Allow: "POST" },
      }),
    );
  // Return an HTTP scope challenge before dispatch; malformed JSON remains the SDK's responsibility.
  if (!canWrite) {
    let body: unknown;
    try {
      body = await request.clone().json();
    } catch {
      body = undefined;
    }
    if (
      Predicate.isObject(body) &&
      "method" in body &&
      "params" in body &&
      body.method === "tools/call" &&
      Predicate.isObject(body.params) &&
      "name" in body.params &&
      typeof body.params.name === "string" &&
      isToolName(body.params.name) &&
      isWriteTool(body.params.name)
    )
      return cors(challenge(resource, 403, true));
  }
  const clientId = token.client_id;
  const board = env.BOARD.getByName(token.sub);
  return cors(
    await serveMcp(request, canWrite, (name, args) => board.callTool(clientId, name, args)),
  );
}
