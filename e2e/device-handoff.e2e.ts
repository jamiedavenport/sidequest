import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { createSession, deleteUser } from "./support/session";

const HANDOFF_TIMEOUT = 15_000;

const ADD_TASK_SHORTCUT = process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";

type SessionCookies = Parameters<BrowserContext["addCookies"]>[0];

async function createDevice(
  browser: Browser,
  baseURL: string | undefined,
  cookies: SessionCookies,
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  await context.addCookies(cookies);
  return context;
}

async function openBoard(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sidequest task board" })).toBeVisible();
  return page;
}

async function expectDeviceIdentity(page: Page, identity: "A" | "B" | null): Promise<void> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e-device"))).toBe(identity);
}

async function identifyDevice(page: Page, identity: "A" | "B"): Promise<void> {
  await page.evaluate((value) => localStorage.setItem("e2e-device", value), identity);
  await expectDeviceIdentity(page, identity);
}

async function addTask(page: Page, lane: string, title: string): Promise<void> {
  const input = page.getByRole("textbox", { name: `Add a task to ${lane}`, exact: true });

  await input.fill(title);
  await input.press(ADD_TASK_SHORTCUT);
  await expect(input).toHaveValue("");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

async function selectLane(page: Page, lane: string): Promise<void> {
  await page
    .getByRole("heading", { name: lane, exact: true })
    .locator("xpath=ancestor::button")
    .click();
  await expect(
    page.getByRole("textbox", { name: `Add a task to ${lane}`, exact: true }),
  ).toBeVisible();
}

async function addLane(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: "New lane", exact: true }).click();
  const titleInput = page.getByRole("textbox", { name: "Rename New lane", exact: true });
  await titleInput.fill(title);
  await titleInput.press("Enter");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
}

async function editTask(page: Page, currentTitle: string, nextTitle: string): Promise<void> {
  await page.getByRole("button", { name: `${currentTitle} options`, exact: true }).click();
  await page.getByRole("menuitem", { name: /Edit/ }).click();

  const titleInput = page.getByRole("textbox", { name: "Task title", exact: true });
  await titleInput.fill(nextTitle);
  await page.getByRole("button", { name: "Save task", exact: true }).click();

  await expect(page.getByText(currentTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByText(nextTitle, { exact: true })).toBeVisible();
}

async function setDeviceOffline(
  context: BrowserContext,
  page: Page,
  offline: boolean,
): Promise<void> {
  await context.setOffline(offline);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(!offline);
}

async function expectTasks(page: Page, titles: ReadonlyArray<string>): Promise<void> {
  await Promise.all(
    titles.map((title) =>
      expect(page.getByText(title, { exact: true })).toBeVisible({
        timeout: HANDOFF_TIMEOUT,
      }),
    ),
  );
}

test("a new device sees the work completed earlier on device A", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(60_000);

  let deviceA: BrowserContext | undefined;
  let deviceB: BrowserContext | undefined;
  let userId: string | undefined;
  const suffix = crypto.randomUUID();
  const projectName = `Website launch ${suffix}`;
  const initialBrief = `Draft launch brief ${suffix}`;
  const finalBrief = `Share launch brief ${suffix}`;
  const reviewTask = `Review launch copy ${suffix}`;
  const followUpTask = `Follow up with design ${suffix}`;

  try {
    const session = await test.step("sign in on device A", async () => {
      const created = await createSession(request);
      userId = created.user.id;
      deviceA = await createDevice(browser, baseURL, created.cookies);

      const pageA = await openBoard(deviceA);
      await expectDeviceIdentity(pageA, null);
      await identifyDevice(pageA, "A");
      return { pageA, session: created };
    });

    await test.step("work from device A throughout the day", async () => {
      await addLane(session.pageA, projectName);
      await addTask(session.pageA, projectName, initialBrief);
      await addTask(session.pageA, projectName, reviewTask);
      await editTask(session.pageA, initialBrief, finalBrief);

      await selectLane(session.pageA, "Today");
      await addTask(session.pageA, "Today", followUpTask);
    });

    await test.step("open device B for the first time later", async () => {
      deviceB = await createDevice(browser, baseURL, session.session.cookies);
      const pageB = await openBoard(deviceB);

      await expectDeviceIdentity(pageB, null);
      await identifyDevice(pageB, "B");

      const project = pageB.getByRole("article", { name: projectName, exact: true });
      await expect(project).toBeVisible({ timeout: HANDOFF_TIMEOUT });
      await expect(project.getByText(finalBrief, { exact: true })).toBeVisible({
        timeout: HANDOFF_TIMEOUT,
      });
      await expect(project.getByText(reviewTask, { exact: true })).toBeVisible({
        timeout: HANDOFF_TIMEOUT,
      });
      await expect(pageB.getByText(followUpTask, { exact: true })).toBeVisible({
        timeout: HANDOFF_TIMEOUT,
      });
      await expect(pageB.getByText(initialBrief, { exact: true })).toHaveCount(0);
    });
  } finally {
    await Promise.all([deviceA?.close(), deviceB?.close()]);
    if (userId !== undefined) {
      await deleteUser(request, userId);
    }
  }
});

test("a previously used device catches up after being closed while device A changes the board", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(60_000);

  let deviceA: BrowserContext | undefined;
  let deviceB: BrowserContext | undefined;
  let userId: string | undefined;
  const suffix = crypto.randomUUID();
  const initialPlan = `Plan the workday ${suffix}`;
  const revisedPlan = `Plan tomorrow's handoff ${suffix}`;
  const todayTask = `Send the status update ${suffix}`;
  const inboxTask = `Read customer feedback ${suffix}`;

  try {
    const session =
      await test.step("sign in and establish device B's older local state", async () => {
        const created = await createSession(request);
        userId = created.user.id;

        deviceA = await createDevice(browser, baseURL, created.cookies);
        const pageA = await openBoard(deviceA);
        await identifyDevice(pageA, "A");
        await addTask(pageA, "Today", initialPlan);

        deviceB = await createDevice(browser, baseURL, created.cookies);
        const pageB = await openBoard(deviceB);
        await expectDeviceIdentity(pageB, null);
        await identifyDevice(pageB, "B");
        await expect(pageB.getByText(initialPlan, { exact: true })).toBeVisible({
          timeout: HANDOFF_TIMEOUT,
        });
        await pageB.close();

        return pageA;
      });

    await test.step("continue working on device A while device B is closed", async () => {
      await editTask(session, initialPlan, revisedPlan);
      await addTask(session, "Today", todayTask);

      await selectLane(session, "Inbox");
      await addTask(session, "Inbox", inboxTask);
    });

    await test.step("reopen device B later with its existing browser data", async () => {
      if (deviceB === undefined) {
        throw new Error("Device B was not initialized");
      }

      const pageB = await openBoard(deviceB);
      await expectDeviceIdentity(pageB, "B");

      await expect(pageB.getByText(revisedPlan, { exact: true })).toBeVisible({
        timeout: HANDOFF_TIMEOUT,
      });
      await expect(pageB.getByText(todayTask, { exact: true })).toBeVisible({
        timeout: HANDOFF_TIMEOUT,
      });
      await expect(pageB.getByText(inboxTask, { exact: true })).toBeVisible({
        timeout: HANDOFF_TIMEOUT,
      });
      await expect(pageB.getByText(initialPlan, { exact: true })).toHaveCount(0);
    });
  } finally {
    await Promise.all([deviceA?.close(), deviceB?.close()]);
    if (userId !== undefined) {
      await deleteUser(request, userId);
    }
  }
});

test("device B catches up after divergent stores and repeated network reconnects", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120_000);

  let deviceA: BrowserContext | undefined;
  let deviceB: BrowserContext | undefined;
  let controlDevice: BrowserContext | undefined;
  let userId: string | undefined;
  const suffix = crypto.randomUUID();
  const baseline = `Agree the daily plan ${suffix}`;
  const firstA = `A writes the launch notes ${suffix}`;
  const firstB = `B captures the customer call ${suffix}`;
  const secondA = `A prepares the release ${suffix}`;
  const secondB = `B reviews the metrics ${suffix}`;
  const finalA = `A records the final decision ${suffix}`;
  const finalB = `B records the follow-up ${suffix}`;
  const changesFromA = [baseline, firstA, secondA, finalA];
  const changesFromB = [baseline, firstB, secondB, finalB];

  try {
    const session = await test.step("start with two independent synchronized devices", async () => {
      const created = await createSession(request);
      userId = created.user.id;

      deviceA = await createDevice(browser, baseURL, created.cookies);
      deviceB = await createDevice(browser, baseURL, created.cookies);
      const pageA = await openBoard(deviceA);
      const pageB = await openBoard(deviceB);
      await identifyDevice(pageA, "A");
      await identifyDevice(pageB, "B");

      await addTask(pageA, "Today", baseline);
      await expectTasks(pageB, [baseline]);
      return { cookies: created.cookies, pageA, pageB };
    });

    await test.step("diverge the local stores across B's first network reconnect", async () => {
      if (deviceB === undefined) {
        throw new Error("Device B was not initialized");
      }

      await setDeviceOffline(deviceB, session.pageB, true);
      await addTask(session.pageB, "Today", firstB);
      await addTask(session.pageA, "Today", firstA);

      await setDeviceOffline(deviceB, session.pageB, false);
    });

    await test.step("continue changing both stores across B's second network reconnect", async () => {
      if (deviceB === undefined) {
        throw new Error("Device B was not initialized");
      }

      await setDeviceOffline(deviceB, session.pageB, true);
      await addTask(session.pageB, "Today", secondB);
      await addTask(session.pageA, "Today", secondA);

      await setDeviceOffline(deviceB, session.pageB, false);
    });

    await test.step("continue changing both stores across B's third network reconnect", async () => {
      if (deviceB === undefined) {
        throw new Error("Device B was not initialized");
      }

      await setDeviceOffline(deviceB, session.pageB, true);
      await addTask(session.pageB, "Today", finalB);
      await addTask(session.pageA, "Today", finalA);

      await setDeviceOffline(deviceB, session.pageB, false);
    });

    await test.step("confirm A's changes reached the shared store", async () => {
      controlDevice = await createDevice(browser, baseURL, session.cookies);
      const controlPage = await openBoard(controlDevice);
      await expectTasks(controlPage, changesFromA);
      await controlDevice.close();
      controlDevice = undefined;
    });

    await test.step("switch away from A and inspect B's repeatedly resumed local store", async () => {
      await deviceA?.close();
      deviceA = undefined;
      await session.pageB.bringToFront();
      await expectDeviceIdentity(session.pageB, "B");
      await expectTasks(session.pageB, changesFromB);
      await expectTasks(session.pageB, changesFromA);
    });
  } finally {
    await Promise.all([deviceA?.close(), deviceB?.close(), controlDevice?.close()]);
    if (userId !== undefined) {
      await deleteUser(request, userId);
    }
  }
});
