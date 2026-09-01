import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { pauseAt } from "./support/pause";
import { createSession, deleteUser } from "./support/session";

const SYNC_TIMEOUT = 15_000;

function requirePage(page: Page | undefined, device: "A" | "B"): Page {
  if (page === undefined) {
    throw new Error(`Device ${device} is not connected`);
  }

  return page;
}

test("live task changes propagate between devices and into a fresh snapshot", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(60_000);

  let deviceA: BrowserContext | undefined;
  let deviceB: BrowserContext | undefined;
  let pageA: Page | undefined;
  let pageB: Page | undefined;
  let userId: string | undefined;
  const taskTitle = `Cross-device task ${crypto.randomUUID()}`;
  const previewTaskTitle = `Server update ${crypto.randomUUID()} https://preview.sidequest.invalid/item`;

  try {
    const session = await test.step("authenticate", async () => {
      const created = await createSession(request);
      userId = created.user.id;
      return created;
    });

    await test.step("connect both devices", async () => {
      deviceA = await browser.newContext({ baseURL });
      deviceB = await browser.newContext({ baseURL });
      await Promise.all([deviceA.addCookies(session.cookies), deviceB.addCookies(session.cookies)]);

      const connectedPageA = await deviceA.newPage();
      const connectedPageB = await deviceB.newPage();
      pageA = connectedPageA;
      pageB = connectedPageB;
      await Promise.all([connectedPageA.goto("/"), connectedPageB.goto("/")]);
      await Promise.all([
        expect(connectedPageA.getByRole("heading", { name: "Sidequest task board" })).toBeVisible(),
        expect(connectedPageB.getByRole("heading", { name: "Sidequest task board" })).toBeVisible(),
      ]);

      const [sessionA, sessionB] = await Promise.all([
        connectedPageA.evaluate(() =>
          fetch("/api/auth/get-session").then((response) => response.json()),
        ),
        connectedPageB.evaluate(() =>
          fetch("/api/auth/get-session").then((response) => response.json()),
        ),
      ]);
      expect(sessionA.user.id).toBe(session.user.id);
      expect(sessionB.user.id).toBe(session.user.id);

      await Promise.all([
        connectedPageA.evaluate(() => localStorage.setItem("e2e-device", "A")),
        connectedPageB.evaluate(() => localStorage.setItem("e2e-device", "B")),
      ]);
      await expect
        .poll(() => connectedPageA.evaluate(() => localStorage.getItem("e2e-device")))
        .toBe("A");
      await expect
        .poll(() => connectedPageB.evaluate(() => localStorage.getItem("e2e-device")))
        .toBe("B");

      await pauseAt(connectedPageA, "after-connect");
    });

    await test.step("mutate on A", async () => {
      const connectedPageA = requirePage(pageA, "A");
      const addTask = connectedPageA.getByRole("textbox", { name: "Add a task to Today" });

      await addTask.fill(taskTitle);
      await addTask.locator("xpath=ancestor::form").getByRole("button", { name: /^Add/ }).click();
      await expect(connectedPageA.getByText(taskTitle, { exact: true })).toBeVisible();
    });

    await test.step("observe on B", async () => {
      const connectedPageB = requirePage(pageB, "B");
      await expect(connectedPageB.getByText(taskTitle, { exact: true })).toBeVisible({
        timeout: SYNC_TIMEOUT,
      });
      await pauseAt(connectedPageB, "after-insert");
    });

    await test.step("mutate on B", async () => {
      const connectedPageB = requirePage(pageB, "B");
      const complete = connectedPageB.getByRole("button", { name: `Complete ${taskTitle}` });

      await complete.click();
      await expect(connectedPageB.getByText(taskTitle, { exact: true })).toHaveCount(0);
      await pauseAt(requirePage(pageA, "A"), "after-update");
    });

    await test.step("observe on A", async () => {
      const connectedPageA = requirePage(pageA, "A");
      await expect(connectedPageA.getByText(taskTitle, { exact: true })).toHaveCount(0, {
        timeout: SYNC_TIMEOUT,
      });
    });

    await test.step("verify a fresh snapshot", async () => {
      const deviceC = await browser.newContext({ baseURL });
      try {
        await deviceC.addCookies(session.cookies);
        const pageC = await deviceC.newPage();
        await pageC.goto("/");
        await expect(pageC.getByRole("heading", { name: "Sidequest task board" })).toBeVisible();
        await expect(pageC.getByText(taskTitle, { exact: true })).toHaveCount(0);
        const snapshot: unknown = await pageC.evaluate(
          () =>
            new Promise<unknown>((resolve, reject) => {
              const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
              const socket = new WebSocket(`${protocol}//${window.location.host}/api/board`);
              socket.addEventListener("open", () => {
                socket.send(JSON.stringify({ _tag: "Sync" }));
              });
              socket.addEventListener("message", (event) => {
                socket.close();
                resolve(typeof event.data === "string" ? JSON.parse(event.data) : undefined);
              });
              socket.addEventListener("error", () => {
                reject(new Error("Fresh snapshot socket failed"));
              });
            }),
        );
        expect(snapshot).toEqual(
          expect.objectContaining({
            collections: expect.arrayContaining([
              expect.objectContaining({
                collection: "tasks",
                values: expect.arrayContaining([
                  expect.objectContaining({ completed: true, title: taskTitle }),
                ]),
              }),
            ]),
          }),
        );
      } finally {
        await deviceC.close();
      }
    });

    await test.step("verify a server-originated update", async () => {
      const connectedPageA = requirePage(pageA, "A");
      const connectedPageB = requirePage(pageB, "B");
      const addTask = connectedPageA.getByRole("textbox", { name: "Add a task to Today" });

      await addTask.fill(previewTaskTitle);
      await addTask.locator("xpath=ancestor::form").getByRole("button", { name: /^Add/ }).click();

      const remoteTask = connectedPageB.getByText(previewTaskTitle, { exact: true });
      await expect(remoteTask).toBeVisible({ timeout: SYNC_TIMEOUT });
      await expect(
        remoteTask.locator("xpath=ancestor::li").getByText("E2E link preview"),
      ).toBeVisible({ timeout: SYNC_TIMEOUT });
      await expect(
        connectedPageA
          .getByText(previewTaskTitle, { exact: true })
          .locator("xpath=ancestor::li")
          .getByText("E2E link preview"),
      ).toBeVisible({ timeout: SYNC_TIMEOUT });
    });
  } finally {
    await Promise.all([deviceA?.close(), deviceB?.close()]);
    if (userId !== undefined) {
      await deleteUser(request, userId);
    }
  }
});
