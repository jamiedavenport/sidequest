import { expect, type Page, type TestInfo } from "@playwright/test";
import { Effect, Schema } from "effect";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

class DemoCaptureError extends Schema.TaggedError<DemoCaptureError>()("DemoCaptureError", {
  cause: Schema.Defect(),
}) {}

const captureError = (cause: unknown) => new DemoCaptureError({ cause });

const outputDirectory = resolve(".playwright/demo-screenshots");

const captureScreenshot = Effect.fn("captureScreenshot")(function* (
  page: Page,
  testInfo: TestInfo,
  name: string,
  firstLane = "Today",
) {
  yield* Effect.tryPromise({
    try: () => page.mouse.move(0, 0),
    catch: captureError,
  });
  yield* Effect.tryPromise({
    try: () =>
      page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.getSelection()?.removeAllRanges();
      }),
    catch: captureError,
  });
  yield* Effect.tryPromise({
    try: () =>
      page
        .getByRole("article", { name: firstLane, exact: true, includeHidden: true })
        .evaluate((lane) => {
          const board = lane.parentElement;
          if (board !== null) {
            board.scrollTo({
              left:
                board.scrollLeft +
                lane.getBoundingClientRect().left -
                board.getBoundingClientRect().left,
              behavior: "instant",
            });
          }
        }),
    catch: captureError,
  });
  const path = resolve(outputDirectory, `${name}.png`);
  let previous: Buffer | undefined;
  // Wait for consecutive identical renders, including the lazy whiteboard canvas.
  // No visual baselines or arbitrary sleep are needed for asset production.
  yield* Effect.tryPromise({
    try: () =>
      expect
        .poll(
          async () => {
            const current = await page.screenshot({
              animations: "disabled",
              caret: "hide",
              scale: "device",
              style:
                "* { scrollbar-width: none !important; } *::-webkit-scrollbar { display: none !important; }",
            });
            const stable = previous?.equals(current) ?? false;
            previous = current;
            return stable;
          },
          { message: `Wait for ${name} to finish rendering`, timeout: 15_000 },
        )
        .toBe(true),
    catch: captureError,
  });
  if (previous === undefined) {
    return yield* new DemoCaptureError({ cause: "Screenshot did not produce an image." });
  }
  const buffer = previous;
  yield* Effect.tryPromise({ try: () => writeFile(path, buffer), catch: captureError });
  yield* Effect.tryPromise({
    try: () => testInfo.attach(name, { path, contentType: "image/png" }),
    catch: captureError,
  });
  return {
    file: `${name}.png`,
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
});

export const captureDemoScreenshots = Effect.fn("captureDemoScreenshots")(function* (
  page: Page,
  testInfo: TestInfo,
  anchorDate: string,
) {
  yield* Effect.tryPromise({
    try: () => expect(page.evaluate(() => window.devicePixelRatio)).resolves.toBe(2),
    catch: captureError,
  });
  yield* Effect.tryPromise({
    try: () => mkdir(outputDirectory, { recursive: true }),
    catch: captureError,
  });
  // Publish the manifest only after every shot succeeds; keep previous PNGs on failure.
  yield* Effect.tryPromise({
    try: () => rm(resolve(outputDirectory, "manifest.json"), { force: true }),
    catch: captureError,
  });
  yield* Effect.forEach(["Today", "Inbox", "Launch", "Engineering", "Learning", "Life"], (name) =>
    Effect.tryPromise({
      try: () => expect(page.getByRole("article", { name, exact: true })).toBeVisible(),
      catch: captureError,
    }),
  );
  yield* Effect.tryPromise({
    try: () =>
      expect(
        page
          .getByRole("article", { name: "Today", exact: true })
          .getByRole("button", { name: /^Select / }),
      ).toHaveCount(9),
    catch: captureError,
  });
  yield* Effect.tryPromise({
    try: () => page.getByRole("button", { name: "Necessary only", exact: true }).click(),
    catch: captureError,
  });
  yield* Effect.tryPromise({
    try: () => expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeHidden(),
    catch: captureError,
  });
  const shots = [yield* captureScreenshot(page, testInfo, "01-board")];
  shots.push(yield* captureScreenshot(page, testInfo, "02-projects", "Launch"));
  const launch = page.getByRole("article", { name: "Launch", exact: true });
  yield* Effect.tryPromise({
    try: () =>
      launch.getByRole("button", { name: "Select Ship the next release", exact: true }).click(),
    catch: captureError,
  });
  yield* Effect.tryPromise({ try: () => page.keyboard.press("n"), catch: captureError });
  yield* Effect.tryPromise({
    try: () => expect(page.locator("[data-note-editor]")).toContainText("Goal: ship a quieter"),
    catch: captureError,
  });
  const dialog = page.getByRole("dialog");
  shots.push(yield* captureScreenshot(page, testInfo, "03-notes"));
  yield* Effect.tryPromise({
    try: () => dialog.getByRole("button", { name: "Close", exact: true }).click(),
    catch: captureError,
  });
  yield* Effect.tryPromise({
    try: () =>
      launch
        .getByRole("button", { name: "Select Sketch the release process", exact: true })
        .click(),
    catch: captureError,
  });
  yield* Effect.tryPromise({ try: () => page.keyboard.press("w"), catch: captureError });
  yield* Effect.tryPromise({
    try: () =>
      expect(page.getByRole("toolbar", { name: "Whiteboard drawing tools" })).toBeVisible(),
    catch: captureError,
  });
  yield* Effect.tryPromise({
    try: () => expect(dialog.getByText("Saved", { exact: true })).toBeVisible(),
    catch: captureError,
  });
  yield* Effect.tryPromise({
    try: () => page.getByRole("button", { name: "Fit drawing to view" }).click(),
    catch: captureError,
  });
  shots.push(yield* captureScreenshot(page, testInfo, "04-whiteboard"));
  const viewport = page.viewportSize();
  if (
    viewport === null ||
    shots.some((shot) => shot.width !== viewport.width * 2 || shot.height !== viewport.height * 2)
  ) {
    return yield* new DemoCaptureError({
      cause: "All screenshots must share the configured 2× viewport dimensions.",
    });
  }
  // Remove outputs from the previous mixed-size capture set after a successful capture.
  yield* Effect.forEach(
    [
      "02-all-lanes.png",
      "03-launch-detail.png",
      "04-notes.png",
      "05-notes-detail.png",
      "06-whiteboard.png",
      "07-whiteboard-detail.png",
    ],
    (file) =>
      Effect.tryPromise({
        try: () => rm(resolve(outputDirectory, file), { force: true }),
        catch: captureError,
      }),
  );
  yield* Effect.tryPromise({
    try: () =>
      writeFile(
        resolve(outputDirectory, "manifest.json"),
        `${JSON.stringify(
          {
            anchorDate,
            browser: "chromium",
            deviceScaleFactor: 2,
            locale: "en-GB",
            timezoneId: "UTC",
            colorScheme: "light",
            shots,
          },
          null,
          2,
        )}\n`,
      ),
    catch: captureError,
  });
  return yield* Effect.log(`Saved ${shots.length} promotional screenshots to ${outputDirectory}`);
});
