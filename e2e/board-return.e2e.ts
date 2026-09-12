// Navigation must finish before the next visit starts.
// oxlint-disable no-await-in-loop
import { expect, test } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";
import { holdTemporaryOpfsFile, readTemporaryOpfsFile } from "./support/locked-opfs";

test("client navigation opens the board despite a locked temporary OPFS directory", async ({
  page,
  context,
  request,
}) => {
  const account = await createSession(request, { seed: "demo" });
  try {
    await context.addCookies(account.cookies);
    await page.goto("/settings");
    await expect(page.getByText("Google Calendar is not configured yet.")).toBeVisible();
    await holdTemporaryOpfsFile(page);
    await page.getByRole("link", { name: "Homepage", exact: true }).click();
    const composer = page.getByRole("textbox", { name: "Add a task to Today", exact: true });
    await expect(composer).toBeEditable();
    for (let visit = 0; visit < 2; visit++) {
      await page.getByRole("button", { name: "Application menu" }).click();
      await page.getByRole("menuitem", { name: "Privacy policy", exact: true }).click();
      await expect(page).toHaveURL(/\/privacy$/);
      await page.getByRole("link", { name: "← Sidequest", exact: true }).click();
      await expect(composer).toBeEditable();
      await page.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(page).toHaveURL(/\/settings$/);
      await page.getByRole("link", { name: "Back to your board", exact: true }).click();
      await expect(composer).toBeEditable();
      expect(await readTemporaryOpfsFile(page)).toBe("retained");
    }
  } finally {
    await deleteUser(request, account.user.id);
  }
});

test("a database worker failure records its stage and can be retried", async ({
  page,
  context,
  request,
}) => {
  const account = await createSession(request);
  const failures: Record<string, unknown>[] = [];
  await page.route("**/api/telemetry", async (route) => {
    const { records } = route.request().postDataJSON();
    for (const record of records) {
      if (record.event === "storage_failed") {
        failures.push(record.details);
      }
    }
    await route.fulfill({ status: 204 });
  });
  try {
    await context.addCookies(account.cookies);
    await context.addInitScript(() => {
      const NativeWorker = Worker;
      let failed = false;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (!failed && String(url).includes("opfs-worker")) {
            failed = true;
            setTimeout(() => this.dispatchEvent(new Event("error")), 0);
          }
        }
      };
    });
    await page.goto("/");
    await expect(page.getByRole("alert")).toHaveText(
      "Unable to open your saved board. Please try again.Retry",
    );
    await expect
      .poll(() => failures.some((failure) => failure.failureStage === "database"))
      .toBe(true);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Add a task to Today", exact: true }),
    ).toBeEditable();
  } finally {
    await deleteUser(request, account.user.id);
  }
});
