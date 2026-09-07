// These fixtures inspect only test-owned browser queues.
// oxlint-disable typescript/no-unsafe-type-assertion
import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

async function trackBoardSockets(context: BrowserContext) {
  await context.addInitScript(() => {
    const sockets: WebSocket[] = [];
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (String(url).includes("/api/board")) {
          sockets.push(this);
        }
      }
    };
    Reflect.set(window, "disconnectBoard", () => sockets.forEach((socket) => socket.close()));
  });
}

async function readQueue(page: Page, queueName: string, useFallback: boolean) {
  return page.evaluate(
    async ({ namespace, fallback }) => {
      if (fallback) {
        return Object.fromEntries(
          Object.entries(localStorage).filter(([key]) => key.startsWith(`${namespace}:`)),
        );
      }
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(namespace, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("transactions");
        request.onsuccess = () => resolve(request.result);
        request.addEventListener("error", () => reject(request.error));
      });
      try {
        return await new Promise<Record<string, string>>((resolve, reject) => {
          const store = database.transaction("transactions").objectStore("transactions");
          const values: Record<string, string> = {};
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            if (cursor.result) {
              values[cursor.result.key as string] = cursor.result.value;
              cursor.result.continue();
            } else {
              resolve(values);
            }
          };
          cursor.addEventListener("error", () => reject(cursor.error));
        });
      } finally {
        database.close();
      }
    },
    { namespace: queueName, fallback: useFallback },
  );
}

for (const fallback of [false, true]) {
  test(`offline account queues are isolated and resume with ${fallback ? "localStorage" : "IndexedDB"}`, async ({
    page,
    context,
    request,
    browser,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    const accountA = await createSession(request);
    const accountB = await createSession(request);
    const title = `Private pending edit ${crypto.randomUUID()}`;
    const namespace = `sidequest-outbox-v2-${accountA.user.id}`;
    const fresh = await browser.newContext({ baseURL });
    try {
      await trackBoardSockets(context);
      if (fallback) {
        await context.addInitScript(() => {
          const open = indexedDB.open.bind(indexedDB);
          indexedDB.open = (name, version) => {
            if (name.startsWith("sidequest-outbox-v2-") || name === "__offline-tx-probe__") {
              throw new DOMException("Blocked for regression", "SecurityError");
            }
            return open(name, version);
          };
        });
      }
      await context.addCookies(accountA.cookies);
      await page.goto("/");
      const input = page.getByRole("textbox", { name: "Add a task to Today", exact: true });
      await expect(input).toBeEditable();
      await context.setOffline(true);
      await page.evaluate(() => (Reflect.get(window, "disconnectBoard") as () => void)());
      await input.fill(title);
      await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await expect
        .poll(async () => Object.keys(await readQueue(page, namespace, fallback)).length)
        .toBeGreaterThan(0);
      const pending = await readQueue(page, namespace, fallback);
      // Preserve a valid, unowned legacy queue to prove it is never adopted by the next login.
      await page.evaluate(
        async ({ pending: saved, namespace: prefix, fallback: local }) => {
          if (local) {
            for (const [key, value] of Object.entries(saved)) {
              localStorage.setItem(`offline-tx:${key.slice(prefix.length + 1)}`, value);
            }
            return;
          }
          const database = await new Promise<IDBDatabase>((resolve) => {
            const opening = indexedDB.open("offline-transactions", 1);
            opening.onupgradeneeded = () => opening.result.createObjectStore("transactions");
            opening.onsuccess = () => resolve(opening.result);
          });
          const tx = database.transaction("transactions", "readwrite");
          for (const [key, value] of Object.entries(saved)) {
            tx.objectStore("transactions").put(value, key);
          }
          await new Promise<void>((resolve) => {
            tx.oncomplete = () => resolve();
          });
          database.close();
        },
        { pending, namespace, fallback },
      );
      const legacyNamespace = fallback ? "offline-tx" : "offline-transactions";
      const legacy = await readQueue(page, legacyNamespace, fallback);
      await context.addCookies(accountB.cookies);
      await context.setOffline(false);
      // A's living transport must detect the new cookie account on reconnection.
      await expect
        .poll(async () =>
          (await page.request.get("/api/auth/get-session")).json().then((s) => s.user.id),
        )
        .toBe(accountB.user.id);
      await expect(page.getByText(title, { exact: true })).toHaveCount(0, { timeout: 20_000 });
      await expect(input).toBeEditable();
      await fresh.addCookies(accountB.cookies);
      const freshPage = await fresh.newPage();
      await freshPage.goto("/");
      await expect(freshPage.getByRole("textbox", { name: "Add a task to Today" })).toBeEditable();
      await expect(freshPage.getByText(title, { exact: true })).toHaveCount(0);
      expect(Object.keys(await readQueue(page, namespace, fallback))).toEqual(Object.keys(pending));
      expect(await readQueue(page, legacyNamespace, fallback)).toEqual(legacy);
      await context.addCookies(accountA.cookies);
      await page.goto("/");
      await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
      await fresh.addCookies(accountA.cookies);
      await freshPage.goto("/");
      await expect(freshPage.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(async () => Object.keys(await readQueue(page, namespace, fallback)).length)
        .toBe(0);
      expect(await readQueue(page, legacyNamespace, fallback)).toEqual(legacy);
    } finally {
      await context.setOffline(false);
      await fresh.close();
      await deleteUser(request, accountA.user.id);
      await deleteUser(request, accountB.user.id);
    }
  });
}

test("unavailable outbox storage offers Retry before accepting edits", async ({
  page,
  context,
  request,
}) => {
  const account = await createSession(request);
  try {
    await context.addCookies(account.cookies);
    await context.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (name, version) => {
        if (name.startsWith("sidequest-outbox-v2-") || name === "__offline-tx-probe__") {
          throw new Error("Blocked");
        }
        return open(name, version);
      };
      const setItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (key, value) => {
        if (key === "__offline-tx-probe__") {
          throw new Error("Blocked");
        }
        setItem(key, value);
      };
      Reflect.set(window, "restoreStorage", () => {
        indexedDB.open = open;
        localStorage.setItem = setItem;
      });
    });
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("Unable to open your saved board");
    await expect(page.getByRole("textbox", { name: "Add a task to Today" })).toHaveCount(0);
    await page.evaluate(() => (Reflect.get(window, "restoreStorage") as () => void)());
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Add a task to Today" })).toBeEditable();
  } finally {
    await deleteUser(request, account.user.id);
  }
});

test("same-account tabs coordinate live edits and replay the leader's pending queue", async ({
  page,
  context,
  request,
}) => {
  const account = await createSession(request);
  const title = `Shared pending task ${crypto.randomUUID()}`;
  try {
    await trackBoardSockets(context);
    await context.addCookies(account.cookies);
    await page.goto("/");
    const input = page.getByRole("textbox", { name: "Add a task to Today", exact: true });
    await expect(input).toBeEditable();
    const other = await context.newPage();
    await other.goto("/");
    await expect(other.getByRole("textbox", { name: "Add a task to Today" })).toBeEditable();
    const locks = await page.evaluate(async () =>
      (await navigator.locks.query()).held?.map((lock) => lock.name),
    );
    expect(
      locks?.filter((name) => name === `sidequest-outbox-v2-${account.user.id}-leader`),
    ).toHaveLength(1);
    await context.setOffline(true);
    await page.evaluate(() => (Reflect.get(window, "disconnectBoard") as () => void)());
    await input.fill(title);
    await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await expect
      .poll(
        async () =>
          Object.keys(await readQueue(page, `sidequest-outbox-v2-${account.user.id}`, false))
            .length,
      )
      .toBeGreaterThan(0);
    await context.setOffline(false);
    await expect(other.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () =>
          Object.keys(await readQueue(page, `sidequest-outbox-v2-${account.user.id}`, false))
            .length,
      )
      .toBe(0);
  } finally {
    await context.setOffline(false);
    await deleteUser(request, account.user.id);
  }
});

test("confirmed sign-out stops reconnecting and preserves offline edits for the next session", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createSession(request);
  const title = `Signed-out pending task ${crypto.randomUUID()}`;
  try {
    await trackBoardSockets(context);
    await context.addCookies(account.cookies);
    await page.goto("/");
    const input = page.getByRole("textbox", { name: "Add a task to Today", exact: true });
    await expect(input).toBeEditable();
    await context.setOffline(true);
    await page.evaluate(() => (Reflect.get(window, "disconnectBoard") as () => void)());
    await input.fill(title);
    await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await expect
      .poll(
        async () =>
          Object.keys(await readQueue(page, `sidequest-outbox-v2-${account.user.id}`, false))
            .length,
      )
      .toBeGreaterThan(0);
    const signedOut = await context.request.post("/api/auth/sign-out", {
      data: {},
      headers: { origin: new URL(page.url()).origin },
    });
    expect(signedOut.status()).toBe(200);
    await context.setOffline(false);
    await expect(page).toHaveURL(/\/login$/);
    expect(
      Object.keys(await readQueue(page, `sidequest-outbox-v2-${account.user.id}`, false)).length,
    ).toBeGreaterThan(0);
    const replacement = await request.post(
      `/api/e2e/session?userId=${encodeURIComponent(account.user.id)}`,
      {
        headers: { "x-sidequest-e2e-secret": "sidequest-e2e-session-helper-secret" },
      },
    );
    const { cookies } = await replacement.json();
    await context.addCookies(cookies);
    await page.goto("/");
    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () =>
          Object.keys(await readQueue(page, `sidequest-outbox-v2-${account.user.id}`, false))
            .length,
      )
      .toBe(0);
  } finally {
    await context.setOffline(false);
    await deleteUser(request, account.user.id);
  }
});

test("an account change during initialization cannot publish the previous client", async ({
  page,
  context,
  request,
}) => {
  const accountA = await createSession(request);
  const accountB = await createSession(request);
  try {
    await context.addCookies(accountA.cookies);
    await context.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      let blocked = false;
      indexedDB.open = (name, version) => {
        const opening = open(name, version);
        if (name === "__offline-tx-probe__" && !blocked) {
          blocked = true;
          Object.defineProperty(opening, "onsuccess", {
            set(listener: (event: Event) => void) {
              opening.addEventListener("success", (event) => {
                Reflect.set(window, "releaseInitialization", () => listener.call(opening, event));
              });
            },
          });
        }
        return opening;
      };
    });
    const connections: string[] = [];
    page.on("websocket", (socket) => {
      if (socket.url().includes("/api/board")) {
        connections.push(socket.url());
      }
    });
    await page.goto("/");
    await page.waitForFunction(
      () => typeof Reflect.get(window, "releaseInitialization") === "function",
    );
    await expect(page.getByText("Booting up", { exact: true })).toBeVisible();
    await context.addCookies(accountB.cookies);
    await page.getByRole("link", { name: "Privacy policy", exact: true }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await page.evaluate(() => (Reflect.get(window, "releaseInitialization") as () => void)());
    await page.getByRole("link", { name: "← Sidequest", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Add a task to Today" })).toBeEditable();
    await expect.poll(() => connections.length).toBeGreaterThan(0);
    expect(
      connections.every((url) => new URL(url).searchParams.get("userId") === accountB.user.id),
    ).toBe(true);
  } finally {
    await deleteUser(request, accountA.user.id);
    await deleteUser(request, accountB.user.id);
  }
});
