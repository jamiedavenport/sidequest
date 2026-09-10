// Browser fixture properties and protocol messages are controlled by these tests.
// oxlint-disable typescript/no-unsafe-type-assertion
import { expect, test, type Page } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

const fixtureHeaders = { "x-sidequest-e2e-secret": "sidequest-e2e-session-helper-secret" };

async function openSocket(page: Page, accountId: string, socketName: string) {
  await page.evaluate(
    async ({ userId, name }) => {
      const socket = new WebSocket(
        `${location.origin.replace("http", "ws")}/api/board?syncVersion=3&userId=${encodeURIComponent(userId)}`,
      );
      const state = { socket, messages: [] as { _tag: string }[], code: 0 };
      Reflect.set(window, name, state);
      socket.addEventListener("message", (event: MessageEvent<string>) =>
        state.messages.push(JSON.parse(event.data)),
      );
      socket.addEventListener("close", (event) => {
        state.code = event.code;
      });
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve());
        socket.addEventListener("error", () => reject(new Error("Socket failed")));
      });
    },
    { userId: accountId, name: socketName },
  );
  // Establish the application session just as SyncTransport does on open.
  await send(page, socketName, "Sync");
  await expect
    .poll(async () => (await socketState(page, socketName)).messages.map((m) => m._tag))
    .toContain("Snapshot");
  await page.evaluate((name) => {
    const state = Reflect.get(window, name) as { messages: unknown[] };
    state.messages.length = 0;
  }, socketName);
}

async function send(page: Page, socketName: string, messageTag: "Sync" | "Mutate") {
  await page.evaluate(
    ({ name, tag }) => {
      const state = Reflect.get(window, name) as { socket: WebSocket };
      const id = crypto.randomUUID();
      state.socket.send(
        JSON.stringify({
          _tag: tag,
          transactionId: crypto.randomUUID(),
          mutations:
            tag === "Mutate"
              ? [
                  {
                    collection: "tasks",
                    type: "insert",
                    key: id,
                    value: {
                      id,
                      title: "Session regression",
                      completed: false,
                      collapsed: false,
                      rank: 0,
                    },
                  },
                ]
              : [],
        }),
      );
    },
    { name: socketName, tag: messageTag },
  );
}

async function socketState(page: Page, socketName: string) {
  return page.evaluate((name) => {
    const { messages, code } = Reflect.get(window, name) as {
      messages: { _tag: string }[];
      code: number;
    };
    return { messages, code };
  }, socketName);
}

test("real sign-out revokes reads, writes and broadcasts but leaves another session usable", async ({
  page,
  context,
  request,
}) => {
  const account = await createSession(request);
  try {
    await context.addCookies(account.cookies);
    await page.goto("/privacy");
    await Promise.all(
      ["read", "write", "broadcast"].map((name) => openSocket(page, account.user.id, name)),
    );
    const replacement = await request.post(
      `/api/e2e/session?userId=${encodeURIComponent(account.user.id)}`,
      { headers: fixtureHeaders },
    );
    const { cookies } = await replacement.json();
    await context.addCookies(cookies);
    await openSocket(page, account.user.id, "valid");
    await context.addCookies(account.cookies);
    const signedOut = await context.request.post("/api/auth/sign-out", {
      headers: { origin: new URL(page.url()).origin },
      data: {},
    });
    expect(signedOut.status(), await signedOut.text()).toBe(200);
    await send(page, "read", "Sync");
    await send(page, "write", "Mutate");
    await send(page, "valid", "Mutate");
    await expect
      .poll(() => socketState(page, "valid"))
      .toEqual({
        code: 0,
        messages: [
          expect.objectContaining({ _tag: "Ack" }),
          expect.objectContaining({ _tag: "Changes" }),
        ],
      });
    await Promise.all(
      ["read", "write", "broadcast"].map((name) =>
        expect
          .poll(async () => ({ name, ...(await socketState(page, name)) }))
          .toEqual({ name, messages: [], code: 4401 }),
      ),
    );
    await send(page, "valid", "Sync");
    await expect
      .poll(async () => (await socketState(page, "valid")).messages.map((m) => m._tag))
      .toEqual(["Ack", "Changes", "Snapshot"]);
  } finally {
    await deleteUser(request, account.user.id);
  }
});

test("session expiry is enforced on established sockets and renewed expiry is read fresh", async ({
  page,
  context,
  request,
}) => {
  const account = await createSession(request);
  try {
    await context.addCookies(account.cookies);
    await page.goto("/privacy");
    const current = await (await context.request.get("/api/auth/get-session")).json();
    await openSocket(page, account.user.id, "expiry");
    await request.put("/api/e2e/session", {
      headers: fixtureHeaders,
      data: { sessionId: current.session.id, expiresInMs: -1 },
    });
    await send(page, "expiry", "Sync");
    await expect.poll(() => socketState(page, "expiry")).toEqual({ messages: [], code: 4401 });
    await request.put("/api/e2e/session", {
      headers: fixtureHeaders,
      data: { sessionId: current.session.id, expiresInMs: 60_000 },
    });
    await context.addCookies(account.cookies);
    await openSocket(page, account.user.id, "renewed");
    await send(page, "renewed", "Sync");
    await expect
      .poll(async () => (await socketState(page, "renewed")).messages.map((m) => m._tag))
      .toEqual(["Snapshot"]);
  } finally {
    await deleteUser(request, account.user.id);
  }
});

test("upgrade rejects legacy clients and wrong accounts despite forged internal headers", async ({
  context,
  request,
}) => {
  const account = await createSession(request);
  try {
    await context.addCookies(account.cookies);
    await Promise.all(
      (
        [
          ["", 400],
          ["?syncVersion=1", 400],
          ["?syncVersion=3", 403],
          ["?syncVersion=3&userId=wrong", 403],
        ] as const
      ).map(async ([query, status]) => {
        const response = await context.request.get(`/api/board${query}`, {
          headers: {
            Upgrade: "websocket",
            "x-sidequest-user-id": "wrong",
            "x-sidequest-session-id": "forged",
          },
        });
        expect(response.status()).toBe(status);
      }),
    );
  } finally {
    await deleteUser(request, account.user.id);
  }
});
