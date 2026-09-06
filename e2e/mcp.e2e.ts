import { inspectTools } from "./support/mcp-inspector";
import { Schema } from "effect";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { createSession, deleteUser } from "./support/session";

async function connectOAuth(
  context: BrowserContext,
  page: Page,
  baseURL: string,
  write: boolean,
  clientId?: string,
) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${baseURL}/mcp-test-callback`;
  if (!clientId) {
    const registration = await context.request.post("/api/auth/oauth2/register", {
      headers: { Cookie: "" },
      data: {
        client_name: "Sidequest integration test",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        application_type: "native",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
    });
    expect(registration.status(), await registration.text()).toBe(201);
    clientId = Schema.decodeUnknownSync(Schema.Struct({ client_id: Schema.String }))(
      await registration.json(),
    ).client_id;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "sidequest:read sidequest:write offline_access",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${baseURL}/mcp`,
    state: "test-state",
    prompt: "consent",
  });
  await page.route("**/mcp-test-callback?**", (route) => route.fulfill({ body: "Connected" }));
  await page.goto(`/api/auth/oauth2/authorize?${params}`);
  await expect(page.getByText("Connect an app", { exact: true })).toBeVisible();
  if (write) await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Allow access" }).click();
  await page.waitForURL("**/mcp-test-callback?**", { timeout: 10000 });
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe("test-state");
  const code = callback.searchParams.get("code");
  expect(code).toBeTruthy();
  const tokenResponse = await context.request.post("/api/auth/oauth2/token", {
    headers: { Cookie: "" },
    form: {
      grant_type: "authorization_code",
      code: code!,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: `${baseURL}/mcp`,
    },
  });
  expect(tokenResponse.status(), await tokenResponse.text()).toBe(200);
  const tokens = Schema.decodeUnknownSync(
    Schema.Struct({
      access_token: Schema.String,
      refresh_token: Schema.String,
      scope: Schema.String,
    }),
  )(await tokenResponse.json());
  const client = new Client({ name: "sidequest-e2e", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    }),
  );
  return { client, tokens, clientId };
}

test("OAuth SDK connection writes to two browsers, retries, reconnects, and revokes", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(90_000);
  const session = await createSession(request);
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  try {
    await contextA.addCookies(session.cookies);
    await contextB.addCookies(session.cookies);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const { client, tokens, clientId } = await connectOAuth(contextA, pageA, baseURL!, true);
    expect((await client.listTools()).tools).toHaveLength(8);
    if (process.env.MCP_INSPECTOR_SMOKE === "1") {
      expect(await inspectTools(`${baseURL}/mcp`, tokens.access_token)).toBe(8);
    }
    await Promise.all([pageA.goto("/"), pageB.goto("/")]);
    await expect(pageA.getByRole("heading", { name: "Sidequest task board" })).toBeVisible();
    await expect(pageB.getByRole("heading", { name: "Sidequest task board" })).toBeVisible();
    const title = `MCP task ${crypto.randomUUID()}`;
    const args = { title, viewId: "today", idempotencyKey: crypto.randomUUID() };
    const [first, retry] = await Promise.all([
      client.callTool({ name: "create_task", arguments: args }),
      client.callTool({ name: "create_task", arguments: args }),
    ]);
    expect(first.isError, JSON.stringify(first)).not.toBe(true);
    expect(retry.structuredContent).toEqual(first.structuredContent);
    await expect(pageA.getByText(title, { exact: true })).toBeVisible();
    await expect(pageB.getByText(title, { exact: true })).toBeVisible();
    const conflict = await client.callTool({
      name: "create_task",
      arguments: { ...args, title: "Different" },
    });
    expect(conflict.isError).toBe(true);
    await contextB.setOffline(true);
    const input = pageB.getByRole("textbox", { name: "Add a task to Today" });
    const offlineTitle = `Offline ${crypto.randomUUID()}`;
    await input.fill(offlineTitle);
    await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    const before = await client.callTool({
      name: "search_tasks",
      arguments: { query: offlineTitle },
    });
    expect(before.structuredContent).toMatchObject({ tasks: [] });
    await contextB.setOffline(false);
    await expect(pageA.getByText(offlineTitle, { exact: true })).toBeVisible({ timeout: 20000 });
    await expect
      .poll(
        async () =>
          (await client.callTool({ name: "search_tasks", arguments: { query: offlineTitle } }))
            .structuredContent,
      )
      .toMatchObject({ tasks: [{ title: offlineTitle }] });
    const refreshed = await contextA.request.post("/api/auth/oauth2/token", {
      headers: { Cookie: "" },
      form: {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: clientId,
        resource: `${baseURL}/mcp`,
      },
    });
    expect(refreshed.status(), await refreshed.text()).toBe(200);
    const refreshedTokens = Schema.decodeUnknownSync(
      Schema.Struct({ access_token: Schema.String, refresh_token: Schema.String }),
    )(await refreshed.json());
    await pageA.goto("/connections");
    await pageA.getByRole("button", { name: "Revoke access" }).click();
    await expect(pageA.getByText("No connected apps.")).toBeVisible();
    await Promise.all(
      [tokens.access_token, refreshedTokens.access_token].map(async (token) => {
        const denied = await contextA.request.post("/mcp", {
          headers: { Authorization: `Bearer ${token}` },
          data: {},
        });
        expect(denied.status()).toBe(401);
      }),
    );
    const deniedRefresh = await contextA.request.post("/api/auth/oauth2/token", {
      headers: { Cookie: "" },
      form: {
        grant_type: "refresh_token",
        refresh_token: refreshedTokens.refresh_token,
        client_id: clientId,
      },
    });
    expect(deniedRefresh.status()).toBe(400);
    await client.close();
  } finally {
    await contextA.close();
    await contextB.close();
    await deleteUser(request, session.user.id);
  }
});

test("read-only consent, user isolation, discovery and OAuth challenges", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(90_000);
  const sessions = await Promise.all([createSession(request), createSession(request)]);
  const contexts = await Promise.all(sessions.map(() => browser.newContext({ baseURL })));
  try {
    const discovery = await request.get("/.well-known/oauth-protected-resource/mcp");
    expect(await discovery.json()).toMatchObject({
      resource: `${baseURL}/mcp`,
      authorization_servers: [`${baseURL}/api/auth`],
    });
    const metadata = await request.get("/.well-known/oauth-authorization-server/api/auth");
    expect(await metadata.json()).toMatchObject({
      code_challenge_methods_supported: ["S256"],
      registration_endpoint: `${baseURL}/api/auth/oauth2/register`,
    });
    const missing = await request.post("/mcp", { data: {} });
    expect(missing.status()).toBe(401);
    expect(missing.headers()["www-authenticate"]).toContain("resource_metadata");
    expect(
      (
        await request.post("/mcp", { headers: { Origin: "https://untrusted.invalid" }, data: {} })
      ).status(),
    ).toBe(403);
    await Promise.all(contexts.map((context, i) => context.addCookies(sessions[i].cookies)));
    const a = await connectOAuth(contexts[0], await contexts[0].newPage(), baseURL!, true);
    const b = await connectOAuth(
      contexts[1],
      await contexts[1].newPage(),
      baseURL!,
      false,
      a.clientId,
    );
    expect((await b.client.listTools()).tools).toHaveLength(4);
    const created = await a.client.callTool({
      name: "create_task",
      arguments: { title: "Private task", idempotencyKey: crypto.randomUUID() },
    });
    const id = Schema.decodeUnknownSync(
      Schema.Struct({ task: Schema.Struct({ id: Schema.String }) }),
    )(created.structuredContent).task.id;
    const other = await b.client.callTool({ name: "get_task", arguments: { taskId: id } });
    expect(other.isError).toBe(true);
    const forbidden = await contexts[1].request.post("/mcp", {
      headers: { Authorization: `Bearer ${b.tokens.access_token}` },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "complete_task", arguments: { taskId: id, idempotencyKey: "no" } },
      },
    });
    expect(forbidden.status()).toBe(403);
    expect(forbidden.headers()["www-authenticate"]).toContain("insufficient_scope");
    await a.client.close();
    await b.client.close();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await Promise.all(sessions.map((session) => deleteUser(request, session.user.id)));
  }
});
