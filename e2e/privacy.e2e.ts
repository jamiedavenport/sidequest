// Page navigations must run sequentially in the same browser tab.
// oxlint-disable eslint/no-await-in-loop
import { expect, test } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

test("public policy pages and login navigation work signed out on mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  const notification = page.getByRole("region", { name: "Your privacy choices" });
  await expect(notification).toHaveCount(1);
  await notification.evaluate((element) => element.setAttribute("data-test-persistent", "true"));
  await notification.getByRole("link", { name: "Privacy policy", exact: true }).click();
  await expect(notification).toHaveAttribute("data-test-persistent", "true");
  await page.goto("/login");
  const navigation = page.getByRole("main").getByRole("navigation", { name: "Privacy" });
  await expect(navigation.getByRole("link", { name: "Privacy policy", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Necessary only", exact: true }).click();
  await navigation.getByRole("link", { name: "Privacy policy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacy policy", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-policy-document] table").first()).toBeVisible();
  await expect(page.locator("[data-policy-document] li").first()).toBeVisible();
  expect(await page.locator("h1").count()).toBe(1);
  await page.getByRole("link", { name: "Cookie policy", exact: true }).click();
  await expect(page).toHaveURL(/\/cookies$/);
  await expect(page.getByRole("region", { name: "Storage inventory", exact: true })).toBeAttached();
  await expect(
    page.getByRole("heading", { level: 1, name: "Cookie policy", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Cookie settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const path of ["/privacy", "/cookies"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("[data-policy-document]")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("consent saves only on confirmation and syncs withdrawal and deletion across tabs", async ({
  page,
  context,
}) => {
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Allow analytics", exact: true }).click();
  const second = await context.newPage();
  await second.goto("/cookies");
  await expect(
    second.getByRole("heading", { name: "Your privacy choices", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cookie settings", exact: true }).click();
  await page.getByRole("switch", { name: "Analytics (OpenPanel)", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("sidequest-consent") ?? "{}").decisions.analytics,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Save preferences", exact: true }).click();
  await second.getByRole("button", { name: "Cookie settings", exact: true }).click();
  await expect(
    second.getByRole("switch", { name: "Analytics (OpenPanel)", exact: true }),
  ).not.toBeChecked();
  await second.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("sidequest-consent"));
  await expect(
    second.getByRole("heading", { name: "Your privacy choices", exact: true }),
  ).toBeVisible();
  await second.getByRole("button", { name: "Allow analytics", exact: true }).click();
  await second.evaluate(() => {
    const record = JSON.parse(localStorage.getItem("sidequest-consent") ?? "{}");
    record.decidedAt = "2020-01-01T00:00:00.000Z";
    localStorage.setItem("sidequest-consent", JSON.stringify(record));
  });
  await second.reload();
  await expect(
    second.getByRole("heading", { name: "Your privacy choices", exact: true }),
  ).toBeVisible();
});

test("analytics requests use static paths and stop after withdrawal while board and billing remain usable", async ({
  page,
  context,
  request,
}) => {
  const session = await createSession(request);
  const events: { body: string; referrer: string | undefined }[] = [];
  const analyticsRequests: string[] = [];
  page.on("request", (req) => {
    if (/@openpanel|@openpanel_web|api.openpanel|replay/i.test(req.url())) {
      analyticsRequests.push(req.url());
    }
  });
  await context.route("https://api.openpanel.dev/**", async (route) => {
    if (route.request().method() === "POST") {
      events.push({
        body: route.request().postData() ?? "",
        referrer: route.request().headers().referer,
      });
    }
    await route.fulfill({ status: 202, body: "" });
  });
  try {
    await context.addCookies(session.cookies);
    await page.goto("/?email=private@example.com&state=secret#token");
    await expect(page.getByRole("heading", { name: "Sidequest task board" })).toBeAttached();
    expect(analyticsRequests).toEqual([]);
    expect(events).toEqual([]);
    await page.getByRole("button", { name: "Necessary only", exact: true }).click();
    await page.getByRole("link", { name: "Billing", exact: true }).click();
    await expect(page).toHaveURL(/\/billing$/);
    expect(events).toEqual([]);
    await page.goto("/?email=private@example.com&state=secret#token");
    await page.getByRole("button", { name: "Application menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Cookie settings", exact: true }).click();
    await page.getByRole("switch", { name: "Analytics (OpenPanel)", exact: true }).click();
    expect(events).toEqual([]);
    await page.getByRole("button", { name: "Save preferences", exact: true }).click();
    await expect.poll(() => events.length).toBe(1);
    expect(events[0]).toEqual({
      body: JSON.stringify({
        type: "track",
        payload: {
          name: "screen_view",
          properties: { __referrer: "", __path: "/", __title: "Sidequest" },
        },
      }),
      referrer: `${new URL(page.url()).origin}/`,
    });
    await page.getByRole("button", { name: "Application menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Cookie settings", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Application menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Cookie settings", exact: true }).click();
    expect(events).toHaveLength(1);
    await page.getByRole("switch", { name: "Analytics (OpenPanel)", exact: true }).click();
    await page.getByRole("button", { name: "Save preferences", exact: true }).click();
    await page.getByRole("link", { name: "Connected apps", exact: true }).click();
    await expect(page).toHaveURL(/\/connections$/);
    expect(events).toHaveLength(1);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sidequest task board" })).toBeAttached();
    await page.getByRole("button", { name: "Application menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Cookie settings", exact: true }).click();
    await page.getByRole("switch", { name: "Analytics (OpenPanel)", exact: true }).click();
    await page.getByRole("button", { name: "Save preferences", exact: true }).click();
    await expect.poll(() => events.length).toBe(2);
    expect(events[1]).toEqual(events[0]);
    await page.getByRole("button", { name: "Application menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Cookie settings", exact: true }).click();
    await page.getByRole("switch", { name: "Analytics (OpenPanel)", exact: true }).click();
    await page.getByRole("button", { name: "Save preferences", exact: true }).click();
    await context.setOffline(true);
    const input = page.getByRole("textbox", { name: "Add a task to Today" });
    await input.fill("Offline with analytics rejected");
    await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await expect(page.getByText("Offline with analytics rejected", { exact: true })).toBeVisible();
    await context.setOffline(false);
    const inventory = await page.evaluate(async () => ({
      localStorage: Object.keys(localStorage),
      databases: (await indexedDB.databases()).map((database) => database.name),
      files: await (async () => {
        const root = await navigator.storage.getDirectory();
        const files: string[] = [];
        for await (const key of root.keys()) {
          files.push(key);
        }
        return files;
      })(),
    }));
    expect(inventory.localStorage).toContain("sidequest-consent");
    expect(inventory.databases).toContain("offline-transactions");
    console.log("Observed storage:", JSON.stringify(inventory));
    console.log(
      "Observed authentication cookies:",
      (await context.cookies()).map(({ name, expires, httpOnly }) => ({ name, expires, httpOnly })),
    );
  } finally {
    await context.setOffline(false);
    await deleteUser(request, session.user.id);
  }
});
