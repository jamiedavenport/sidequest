// Notes are opened sequentially in the same detail sheet.
// oxlint-disable eslint/no-await-in-loop
import { expect, test, type Page } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

const anchorDate = "2026-12-30";

const secret = { "x-sidequest-e2e-secret": "sidequest-e2e-session-helper-secret" };

async function readSnapshot(page: Page, userId: string) {
  return page.evaluate(
    (id) =>
      new Promise<{
        collections: { collection: string; values: { id?: string; completed?: boolean }[] }[];
      }>((resolve, reject) => {
        const socket = new WebSocket(
          `ws://${window.location.host}/api/board?syncVersion=2&userId=${encodeURIComponent(id)}`,
        );
        socket.addEventListener("open", () => socket.send(JSON.stringify({ _tag: "Sync" })));
        socket.addEventListener("message", (event) => {
          socket.close();
          resolve(JSON.parse(String(event.data)));
        });
        socket.addEventListener("error", () => reject(new Error("Snapshot failed")));
      }),
    userId,
  );
}

test("demo fixtures persist across reload and a second client, including notes and whiteboard", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(90_000);
  const session = await createSession(request, { seed: "demo", anchorDate });
  const first = await browser.newContext({ baseURL, viewport: { width: 1512, height: 982 } });
  const second = await browser.newContext({ baseURL });
  try {
    await first.addCookies(session.cookies);
    await second.addCookies(session.cookies);
    const page = await first.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date(`${anchorDate}T12:00:00`));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Launch", exact: true })).toBeVisible();
    const snapshot = await readSnapshot(page, session.user.id);
    expect(
      snapshot.collections.find((collection) => collection.collection === "tasks")?.values,
    ).toHaveLength(40);
    expect(
      snapshot.collections.find((collection) => collection.collection === "lanes")?.values,
    ).toHaveLength(4);
    expect(
      snapshot.collections.find((collection) => collection.collection === "notes")?.values,
    ).toHaveLength(32);
    expect(
      snapshot.collections.find((collection) => collection.collection === "whiteboards")?.values,
    ).toHaveLength(1);
    await expect(
      page
        .getByRole("article", { name: "Today", exact: true })
        .getByRole("button", { name: /^Select / }),
    ).toHaveCount(9);
    await expect(
      page
        .getByRole("article", { name: "Inbox", exact: true })
        .getByRole("button", { name: /^Select / }),
    ).toHaveCount(3);
    await page.screenshot({ path: ".playwright/demo-board.png", fullPage: true });
    for (const [title, text] of [
      ["Ship the next release", "Goal: ship a quieter"],
      ["Sketch the release process", "Each box is a handoff"],
      ["Make search feel instant", "Typing should feel immediate"],
      ["Investigate the flaky build", "The failure appears intermittently"],
      ["Build a small Spanish practice habit", "Aim for ten minutes"],
      ["Plan a weekend in Edinburgh", "A relaxed weekend in Edinburgh"],
    ] as const) {
      await page
        .getByRole("button", { name: `Select ${title}`, exact: true })
        .first()
        .click();
      await page.keyboard.press("n");
      await expect(page.locator("[data-note-editor]")).toContainText(text);
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    }
    await page
      .getByRole("button", { name: "Select Sketch the release process", exact: true })
      .click();
    await page.keyboard.press("w");
    await expect(page.getByRole("toolbar", { name: "Whiteboard drawing tools" })).toBeVisible();
    await page.getByRole("button", { name: "Fit drawing to view" }).click();
    await page.screenshot({ path: ".playwright/demo-whiteboard.png" });
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Launch", exact: true })).toBeVisible();
    expect(await readSnapshot(page, session.user.id)).toEqual(snapshot);
    const other = await second.newPage();
    await other.clock.setFixedTime(new Date(`${anchorDate}T12:00:00`));
    await other.goto("/");
    await expect(other.getByRole("heading", { name: "Launch", exact: true })).toBeVisible();
    expect(await readSnapshot(other, session.user.id)).toEqual(snapshot);
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
    await deleteUser(request, session.user.id);
  }
});

test("starter edits and lane deletion persist through login without recreation", async ({
  page,
  context,
  request,
}) => {
  const session = await createSession(request, { seed: "onboarding" });
  try {
    await context.addCookies(session.cookies);
    await page.goto("/");
    await page.getByRole("button", { name: "Select Make this task your own", exact: true }).click();
    await page.keyboard.press("e");
    await page.getByRole("textbox", { name: "Task title", exact: true }).fill("My first real task");
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Select My first real task", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Getting started options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Remove lane" }).click();
    await page.getByRole("switch", { name: "Delete tasks in this lane" }).click();
    await page.getByRole("button", { name: "Remove lane", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Getting started", exact: true })).toHaveCount(
      0,
    );
    const login = await request.post(`/api/e2e/session?userId=${session.user.id}&seed=demo`, {
      headers: secret,
    });
    expect(login.status()).toBe(200);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Select Capture something on your mind", exact: true }),
    ).toBeVisible();
    const snapshot = await readSnapshot(page, session.user.id);
    expect(
      snapshot.collections.find((collection) => collection.collection === "lanes")?.values,
    ).toHaveLength(0);
    expect(
      snapshot.collections.find((collection) => collection.collection === "tasks")?.values,
    ).toHaveLength(1);
  } finally {
    await deleteUser(request, session.user.id);
  }
});

test("E2E defaults remain empty, existing accounts ignore seed selection, and unauthorized requests fail", async ({
  page,
  context,
  request,
}) => {
  const unauthorizedHeaders: Record<string, string>[] = [{}, { "x-sidequest-e2e-secret": "wrong" }];
  for (const headers of unauthorizedHeaders) {
    expect((await request.post("/api/e2e/session?seed=demo", { headers })).status()).toBe(404);
  }
  expect(
    (
      await request.post("/api/e2e/session?seed=demo&anchorDate=2026-02-30", { headers: secret })
    ).status(),
  ).toBe(400);
  const session = await createSession(request);
  try {
    const login = await request.post(`/api/e2e/session?userId=${session.user.id}&seed=onboarding`, {
      headers: secret,
    });
    expect(login.status()).toBe(200);
    await context.addCookies(session.cookies);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sidequest task board" })).toBeVisible();
    const snapshot = await readSnapshot(page, session.user.id);
    expect(snapshot.collections.every((collection) => collection.values.length === 0)).toBe(true);
  } finally {
    await deleteUser(request, session.user.id);
  }
});
