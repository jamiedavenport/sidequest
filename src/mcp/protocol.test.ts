import { expect, it, vi } from "vitest";
import { serveMcp, toolDefinitions } from "~/mcp/protocol";

function request(body: unknown) {
  return new Request("https://sdqst.app/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify(body),
  });
}

it("initializes a stateless JSON transport", async () => {
  const response = await serveMcp(
    request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    }),
    true,
    vi.fn(),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("mcp-session-id")).toBeNull();
  expect(await response.json()).toMatchObject({
    result: { serverInfo: { name: "sidequest" }, capabilities: { tools: {} } },
  });
});

it("publishes Effect-derived schemas and tool annotations", () => {
  const definitions = toolDefinitions(true);
  expect(definitions).toHaveLength(8);
  expect(toolDefinitions(false)).toHaveLength(4);
  expect(definitions.find((t) => t.name === "create_task")?.inputSchema.required).toContain(
    "idempotencyKey",
  );
  expect(definitions.find((t) => t.name === "get_task")?.annotations?.readOnlyHint).toBe(true);
});

it("lists tools and returns structured results and typed errors", async () => {
  const list = await serveMcp(
    request({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    true,
    vi.fn(),
  );
  expect(await list.json()).toMatchObject({ result: { tools: expect.any(Array) } });
  const call = vi.fn(async () => ({ ok: true as const, result: { tasks: [] }, replay: false }));
  const response = await serveMcp(
    request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_tasks", arguments: {} },
    }),
    true,
    call,
  );
  expect(await response.json()).toMatchObject({
    result: {
      structuredContent: { tasks: [] },
      content: [{ type: "text", text: expect.stringContaining("0 result") }],
    },
  });
  const error = await serveMcp(
    request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_task" } }),
    true,
    async () => ({ ok: false, error: { code: "not_found", message: "Missing" } }),
  );
  expect(await error.json()).toMatchObject({
    result: { isError: true, structuredContent: { error: { code: "not_found" } } },
  });
});

it("rejects malformed protocol requests and unsupported tools", async () => {
  const call = vi.fn();
  const response = await serveMcp(request({ bad: true }), true, call);
  expect(response.status).toBe(400);
  const unknown = await serveMcp(
    request({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "delete_everything" } }),
    true,
    call,
  );
  expect(await unknown.json()).toMatchObject({ result: { isError: true } });
  expect(call).not.toHaveBeenCalled();
});
