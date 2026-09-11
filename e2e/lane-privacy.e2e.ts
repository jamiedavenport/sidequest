import { expect, test } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

test("a new device preserves lane privacy and revealing leaves closed task sheets closed", async ({
  browser,
  baseURL,
  request,
}) => {
  const session = await createSession(request);
  const deviceA = await browser.newContext({ baseURL });
  const deviceB = await browser.newContext({ baseURL });
  const deviceC = await browser.newContext({ baseURL });
  try {
    await Promise.all([deviceA.addCookies(session.cookies), deviceB.addCookies(session.cookies)]);
    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();
    await Promise.all([pageA.goto("/"), pageB.goto("/")]);
    const title = `Private task ${crypto.randomUUID()}`;
    const input = pageA.getByRole("textbox", { name: "Add a task to Today" });
    await input.fill(title);
    await input.press("Meta+Enter");
    await pageA.getByRole("button", { name: `Select ${title}`, exact: true }).click();
    const taskB = pageB.getByRole("button", { name: `Select ${title}`, exact: true });
    await taskB.click();
    await pageB.keyboard.press("n");
    await expect(pageB.getByRole("dialog")).toBeVisible();

    const laneA = pageA.locator('[data-lane-id="today"]');
    const laneB = pageB.locator('[data-lane-id="today"]');
    await laneA.getByRole("button", { name: "Hide lane", exact: true }).click();
    await expect(laneB).toHaveAttribute("data-private", "true");
    await expect(pageB.getByRole("dialog")).toHaveCount(0);
    await deviceC.addCookies(session.cookies);
    const pageC = await deviceC.newPage();
    await pageC.goto("/");
    await expect(pageC.locator('[data-lane-id="today"]')).toHaveAttribute("data-private", "true");
    await expect(laneB).toHaveAttribute("data-private", "true");
    await laneA.getByRole("button", { name: "Show Lane", exact: true }).click();
    await expect(laneB).not.toHaveAttribute("data-private");
    await taskB.click();
    await expect(pageB.getByRole("dialog")).toHaveCount(0);
    await expect(laneB.getByRole("listitem").filter({ has: taskB })).toHaveAttribute(
      "aria-current",
      "true",
    );
  } finally {
    await Promise.all([deviceA.close(), deviceB.close(), deviceC.close()]);
    await deleteUser(request, session.user.id);
  }
});
