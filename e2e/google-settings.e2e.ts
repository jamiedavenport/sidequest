import { expect, test } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

test("settings require login and cancelled Calendar consent leaves sync off", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
  const account = await createSession(request);
  try {
    await context.addCookies(account.cookies);
    await page.goto("/");
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Calendar sync" })).not.toBeChecked();
    await expect(page.getByText("Updating Calendar settings…")).not.toBeVisible();
    await page.goto("/settings?calendar=cancelled");
    await expect(page.getByRole("alert")).toHaveText(
      "Google authorization was cancelled. Calendar settings are unchanged.",
    );
    await expect(page.getByRole("switch", { name: "Calendar sync" })).not.toBeChecked();
    await page.screenshot({ path: ".playwright/google-settings.png", fullPage: true });
  } finally {
    await deleteUser(request, account.user.id);
  }
});
