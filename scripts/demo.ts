import { DateTime, Effect, Schema } from "effect";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { createSession, deleteUser } from "../e2e/support/session";
import { BoardSeedError, SeedAnchorDate } from "../src/board/seeds/schema";
import { captureDemoScreenshots } from "./demo-screenshots";

const screenshots = process.env.DEMO_SCREENSHOTS === "1";

const createDemoSession = Effect.fn("createDemoSession")(function* (request: APIRequestContext) {
  const now = yield* DateTime.now;
  const anchorDate = yield* Schema.decodeUnknownEffect(SeedAnchorDate)(
    process.env.DEMO_ANCHOR_DATE ??
      (screenshots
        ? "2026-09-08"
        : DateTime.formatIsoDate(DateTime.setZone(now, DateTime.zoneMakeLocal()))),
  );
  const session = yield* Effect.tryPromise({
    try: () => createSession(request, { seed: "demo", anchorDate }),
    catch: () => new BoardSeedError({ message: "Could not create demo session." }),
  });
  return { ...session, anchorDate };
});

const openDemo = Effect.fn("openDemo")(function* (
  page: Page,
  session: Effect.Success<ReturnType<typeof createDemoSession>>,
) {
  yield* Effect.tryPromise({
    try: () => page.context().addCookies(session.cookies),
    catch: () => new BoardSeedError({ message: "Could not authenticate demo browser." }),
  });
  if (screenshots || process.env.DEMO_ANCHOR_DATE) {
    yield* Effect.tryPromise({
      try: () =>
        page.clock.setFixedTime(
          new Date(`${session.anchorDate}T12:00:00${screenshots ? "Z" : ""}`),
        ),
      catch: () => new BoardSeedError({ message: "Could not set demo clock." }),
    });
  }
  yield* Effect.tryPromise({
    try: () => page.goto("/"),
    catch: () => new BoardSeedError({ message: "Could not open demo board." }),
  });
});

test(
  screenshots
    ? "capture promotional screenshots"
    : "explore the demo board — close the tab when finished",
  async ({ page, request }, testInfo) => {
    const session = await Effect.runPromise(createDemoSession(request));
    try {
      await Effect.runPromise(openDemo(page, session));
      await expect(page.getByRole("heading", { name: "Sidequest task board" })).toBeVisible();
      if (screenshots) {
        await Effect.runPromise(captureDemoScreenshots(page, testInfo, session.anchorDate));
      } else {
        await page.waitForEvent("close", { timeout: 0 });
      }
    } finally {
      await deleteUser(request, session.user.id);
    }
  },
);
