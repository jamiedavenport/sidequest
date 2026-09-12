import { expect, test } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

test("search hands focus to a revealed nested task after the dialog finishes closing", async ({
  page,
  context,
  request,
}) => {
  const session = await createSession(request, { seed: "demo" });
  try {
    await context.addCookies(session.cookies);
    await page.goto("/");
    const lane = page.locator('[data-lane-id="demo-engineering"]');
    await lane.getByRole("button", { name: "Hide lane", exact: true }).click();
    await expect(lane).toHaveAttribute("data-private", "true");
    await page
      .getByRole("button", { name: "Search tasks, lanes, and actions", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Search and commands" });
    const input = dialog.getByRole("combobox");
    await input.fill("Compare logs from failing runs");
    await input.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(lane).not.toHaveAttribute("data-private");
    await expect(page.locator("#task-demo-engineering-demo-build-logs")).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.locator("[data-board-focus]")).toBeFocused();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(input).toBeFocused();
    await input.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[data-board-focus]")).toBeFocused();
    await page.keyboard.press("n");
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally {
    await deleteUser(request, session.user.id);
  }
});
