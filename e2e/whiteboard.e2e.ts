// Shortcuts must run sequentially against the same editor.
// oxlint-disable eslint/no-await-in-loop
import { expect, test, type Page } from "@playwright/test";
import { createSession, deleteUser } from "./support/session";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

async function openWhiteboard(page: Page, title: string) {
  await page.getByRole("button", { name: `Select ${title}`, exact: true }).click();
  await page.keyboard.press("w");
  await expect(page.getByRole("toolbar", { name: "Whiteboard drawing tools" })).toBeVisible();
}

async function drawRectangle(page: Page, online = true) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const canvas = page.locator(".excalidraw__canvas.interactive");
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Whiteboard has no canvas bounds");
  }
  await page.mouse.move(box.x + 90, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 200, { steps: 5 });
  await page.mouse.up();
  await expect(
    page.getByRole("dialog").getByText(online ? "Saved" : "Saving…", { exact: true }),
  ).toBeVisible();
}

test("whiteboard UI and remote scenes never save themselves; native edits persist offline and on reopen", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(90_000);
  const session = await createSession(request);
  const first = await browser.newContext({ baseURL });
  const second = await browser.newContext({ baseURL });
  const errors: string[] = [];
  const fontRequests: string[] = [];
  const fontFailures: string[] = [];
  const writes: string[] = [];
  const forbiddenRequests: string[] = [];
  try {
    await first.addCookies(session.cookies);
    await second.addCookies(session.cookies);
    const page = await first.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => {
      if (/tldraw|esm\.sh|esm\.run/.test(req.url())) {
        forbiddenRequests.push(req.url());
      }
      if (req.url().includes("/excalidraw/fonts/")) {
        fontRequests.push(req.url());
      }
    });
    page.on("response", (res) => {
      if (res.url().includes("/excalidraw/fonts/") && !res.ok()) {
        fontFailures.push(res.url());
      }
    });
    page.on("websocket", (socket) =>
      socket.on("framesent", (event) => {
        if (String(event.payload).includes('"collection":"whiteboards"')) {
          writes.push(String(event.payload));
        }
      }),
    );
    await page.goto("/");
    const title = "Excalidraw regression";
    const input = page.getByRole("textbox", { name: "Add a task to Today" });
    await input.fill(title);
    await input.press(`${modifier}+Enter`);
    await openWhiteboard(page, title);
    const canvas = page.locator(".excalidraw__canvas.interactive");
    await canvas.click({ position: { x: 20, y: 80 } });
    for (const [key, name] of [
      ["v", "Select"],
      ["h", "Hand"],
      ["d", "Draw"],
      ["e", "Eraser"],
      ["a", "Arrow"],
      ["t", "Text"],
      ["r", "Rectangle"],
      ["o", "Ellipse"],
    ]) {
      await page.keyboard.press(key);
      await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.getByRole("button", { name: "Reset zoom to 100%" }).click();
    await page.waitForTimeout(700);
    expect(writes).toHaveLength(0);
    await drawRectangle(page);
    await expect.poll(() => writes.length).toBe(1);
    await page.keyboard.press(`${modifier}+z`);
    await expect.poll(() => writes.length).toBe(2);
    await page.keyboard.press(`${modifier}+Shift+z`);
    await expect.poll(() => writes.length).toBe(3);
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await canvas.click({ position: { x: 100, y: 300 } });
    await page.keyboard.type("V H D E A T R O stay text");
    await page.keyboard.press("Escape");
    await expect.poll(() => writes.length).toBeGreaterThan(3);
    await expect(page.getByRole("dialog").getByText("Saved", { exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    const beforeRemote = writes.length;
    const other = await second.newPage();
    await other.goto("/");
    await openWhiteboard(other, title);
    const beforeImage = await page
      .locator(".excalidraw__canvas.static")
      .evaluate((node: HTMLCanvasElement) => node.toDataURL());
    await drawRectangle(other);
    await expect
      .poll(() =>
        page
          .locator(".excalidraw__canvas.static")
          .evaluate((node: HTMLCanvasElement) => node.toDataURL()),
      )
      .not.toBe(beforeImage);
    await page.waitForTimeout(700);
    expect(writes).toHaveLength(beforeRemote);
    await page.getByRole("button", { name: "Fit drawing to view" }).click();
    await canvas.evaluate((node) => {
      const data = new DataTransfer();
      data.items.add(new File(["asset"], "image.png", { type: "image/png" }));
      node.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }),
      );
      node.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }),
      );
    });
    await page.waitForTimeout(700);
    expect(writes).toHaveLength(beforeRemote);
    await first.setOffline(true);
    await drawRectangle(page, false);
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await first.setOffline(false);
    await expect.poll(() => writes.length).toBeGreaterThan(beforeRemote);
    const afterReconnect = writes.length;
    await openWhiteboard(page, title);
    await expect(page.getByRole("dialog").getByText("Saved", { exact: true })).toBeVisible();
    await page.waitForTimeout(700);
    expect(writes).toHaveLength(afterReconnect);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".excalidraw .App-top-bar")).toBeHidden();
    await expect(page.locator(".excalidraw .App-bottom-bar")).toBeHidden();
    await expect(page.getByRole("toolbar", { name: "Whiteboard drawing tools" })).toBeVisible();
    expect(fontRequests.length).toBeGreaterThan(0);
    expect(fontFailures).toEqual([]);
    expect(forbiddenRequests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
    await deleteUser(request, session.user.id);
  }
});
