import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  validate: vi.fn(),
  call: vi.fn(),
  getByName: vi.fn(),
  handler: vi.fn(),
}));

vi.mock("~/auth/server", () => ({
  createAuth: () => ({ api: { validateMcpToken: mock.validate }, handler: mock.handler }),
}));
vi.mock("~/env", () => ({ env: { BETTER_AUTH_URL: new URL("https://sdqst.app") } }));

import { handleMcpRoutes } from "~/mcp/http";

const env = {
  MCP_ALLOWED_ORIGINS: "https://client.example",
  BOARD: { getByName: mock.getByName },
};

const token = {
  sub: "user-1",
  client_id: "client-1",
  aud: "https://sdqst.app/mcp",
  scope: "sidequest:read sidequest:write",
};

const request = (
  headers: Record<string, string> = {},
  body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_tasks" } },
) =>
  new Request("https://sdqst.app/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mock.validate.mockResolvedValue(token);
  mock.getByName.mockReturnValue({ callTool: mock.call });
  mock.call.mockResolvedValue({ ok: true, result: { tasks: [] }, replay: false });
});

it("selects the board solely from authenticated identity", async () => {
  expect((await handleMcpRoutes(request(), env))?.status).toBe(200);
  expect(mock.getByName).toHaveBeenCalledWith("user-1");
  expect(mock.call).toHaveBeenCalledWith("client-1", "list_tasks", {});
});

it.each([
  { ...token, aud: "https://different.example/mcp" },
  { ...token, sub: undefined },
  { ...token, client_id: undefined },
  { ...token, cnf: { jkt: "sender-bound-token" } },
])("rejects wrong audience, missing identity, or unproven sender constraints", async (invalid) => {
  mock.validate.mockResolvedValue(invalid);
  expect((await handleMcpRoutes(request(), env))?.status).toBe(401);
  expect(mock.getByName).not.toHaveBeenCalled();
});

it("returns OAuth challenges for invalid tokens and missing scopes", async () => {
  mock.validate.mockRejectedValueOnce(new Error("revoked"));
  const invalid = await handleMcpRoutes(request(), env);
  expect(invalid?.status).toBe(401);
  expect(invalid?.headers.get("WWW-Authenticate")).toContain("oauth-protected-resource/mcp");
  mock.validate.mockResolvedValue({ ...token, scope: "sidequest:write" });
  expect((await handleMcpRoutes(request(), env))?.status).toBe(403);
  mock.validate.mockResolvedValue({ ...token, scope: "sidequest:read" });
  const denied = await handleMcpRoutes(
    request(
      {},
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_task", arguments: { title: "a", idempotencyKey: "k" } },
      },
    ),
    env,
  );
  expect(denied?.headers.get("WWW-Authenticate")).toContain(
    'scope="sidequest:read sidequest:write"',
  );
  expect(mock.call).not.toHaveBeenCalled();
});

it("separates browser CORS from login origins", async () => {
  expect(
    (await handleMcpRoutes(request({ Origin: "https://attacker.example" }), env))?.status,
  ).toBe(403);
  expect(mock.validate).not.toHaveBeenCalled();
  const response = await handleMcpRoutes(request({ Origin: "https://client.example" }), env);
  expect(response?.headers.get("Access-Control-Allow-Origin")).toBe("https://client.example");
  expect(response?.headers.has("Access-Control-Allow-Credentials")).toBe(false);
});
