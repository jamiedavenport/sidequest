// Browser fixture properties and protocol messages are controlled by this test.
// oxlint-disable typescript/no-unsafe-type-assertion
import { expect, test } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

test("expired board requests redirect to billing on the server", async ({
  page,
  context,
  request,
}) => {
  const session = await createSession(request);
  try {
    await context.addCookies(session.cookies);
    await request.patch("/api/e2e/session", {
      headers: { "x-sidequest-e2e-secret": "sidequest-e2e-session-helper-secret" },
      data: { userId: session.user.id, ageDays: 30 },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await context.request.get("/", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/billing");
    await page.goto("/");
    await expect(page).toHaveURL(/\/billing$/);
    await expect(
      page.getByText("Your data and pending edits are preserved.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Subscribe annually" })).toBeDisabled();
    await page.getByRole("link", { name: "Back to your board" }).click();
    await expect(page).toHaveURL(/\/billing$/);
    await expect(page.getByRole("heading", { name: "Sidequest task board" })).toHaveCount(0);
  } finally {
    await deleteUser(request, session.user.id);
  }
});

test("expiry rejects writes on an already connected socket while retaining reads", async ({
  page,
  context,
  request,
}) => {
  const session = await createSession(request);
  try {
    await context.addCookies(session.cookies);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sidequest task board" })).toBeAttached();
    await page.evaluate(async () => {
      const socket = new WebSocket(`${location.origin.replace("http", "ws")}/api/board`);
      await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve()));
      Object.assign(window, { billingTestSocket: socket });
    });
    await request.patch("/api/e2e/session", {
      headers: { "x-sidequest-e2e-secret": "sidequest-e2e-session-helper-secret" },
      data: { userId: session.user.id, ageDays: 30 },
    });
    const messages = await page.evaluate(async () => {
      const socket = Reflect.get(window, "billingTestSocket") as WebSocket;
      const replies: { _tag: string; code?: string }[] = [];
      return new Promise<typeof replies>((resolve) => {
        socket.addEventListener("message", (event: MessageEvent<string>) => {
          const reply = JSON.parse(event.data) as { _tag: string; code?: string };
          replies.push(reply);
          if (replies.length === 2) {
            socket.close();
            resolve(replies);
          }
        });
        socket.send(JSON.stringify({ _tag: "Mutate", transactionId: "blocked", mutations: [] }));
        socket.send(JSON.stringify({ _tag: "Sync" }));
      });
    });
    expect(messages).toContainEqual(
      expect.objectContaining({ _tag: "Reject", code: "billing_required" }),
    );
    expect(messages).toContainEqual(expect.objectContaining({ _tag: "Snapshot" }));
  } finally {
    await deleteUser(request, session.user.id);
  }
});

test("a checkout return cannot claim payment", async ({ page, context, request }) => {
  const session = await createSession(request);
  try {
    await context.addCookies(session.cookies);
    await page.goto("/billing?confirming=1&checkout_id=forged");
    await expect(page.getByText("Confirming payment…", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeDisabled();
    await expect(page.getByText("Paid through", { exact: false })).toHaveCount(0);
  } finally {
    await deleteUser(request, session.user.id);
  }
});

test("offline edits survive the billing redirect and sync after returning to the board", async ({
  page,
  context,
  request,
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const session = await createSession(request);
  const other = await browser.newContext({ baseURL });
  const title = `Preserved offline edit ${crypto.randomUUID()}`;
  try {
    await context.addCookies(session.cookies);
    await other.addCookies(session.cookies);
    await page.goto("/");
    const input = page.getByRole("textbox", { name: "Add a task to Today", exact: true });
    await expect(input).toBeEditable();
    await context.setOffline(true);
    await input.fill(title);
    await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await request.patch("/api/e2e/session", {
      headers: { "x-sidequest-e2e-secret": "sidequest-e2e-session-helper-secret" },
      data: { userId: session.user.id, ageDays: 30 },
    });
    await context.setOffline(false);
    await expect(page).toHaveURL(/\/billing$/);
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    await expect(otherPage).toHaveURL(/\/billing$/);
    await expect(otherPage.getByText(title, { exact: true })).toHaveCount(0);
    // Test-only restoration exercises the same server-confirmed gate as paid recovery.
    await request.patch("/api/e2e/session", {
      headers: { "x-sidequest-e2e-secret": "sidequest-e2e-session-helper-secret" },
      data: { userId: session.user.id, ageDays: 1 },
    });
    await page.getByRole("link", { name: "Back to your board" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await otherPage.getByRole("link", { name: "Back to your board" }).click();
    await expect(otherPage.getByText(title, { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await context.setOffline(false);
    await other.close();
    await deleteUser(request, session.user.id);
  }
});
