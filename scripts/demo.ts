import { DateTime, Effect, Schema } from "effect";
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { createSession, deleteUser } from "../e2e/support/session";
import { BoardSeedError, SeedAnchorDate } from "../src/board/seeds/schema";

const openDemo = Effect.fn("openDemo")(function* (page: Page, request: APIRequestContext) {
  const now = yield* DateTime.now;
  const anchorDate = yield* Schema.decodeUnknownEffect(SeedAnchorDate)(
    process.env.DEMO_ANCHOR_DATE ??
      DateTime.formatIsoDate(DateTime.setZone(now, DateTime.zoneMakeLocal())),
  );
  const session = yield* Effect.tryPromise({
    try: () => createSession(request, { seed: "demo", anchorDate }),
    catch: () => new BoardSeedError({ message: "Could not create demo session." }),
  });
  yield* Effect.tryPromise({
    try: () => page.context().addCookies(session.cookies),
    catch: () => new BoardSeedError({ message: "Could not authenticate demo browser." }),
  });
  if (process.env.DEMO_ANCHOR_DATE) {
    yield* Effect.tryPromise({
      try: () => page.clock.setFixedTime(new Date(`${anchorDate}T12:00:00`)),
      catch: () => new BoardSeedError({ message: "Could not set demo clock." }),
    });
  }
  yield* Effect.tryPromise({
    try: () => page.goto("/"),
    catch: () => new BoardSeedError({ message: "Could not open demo board." }),
  });
  return session;
});

test("explore the demo board — close the tab when finished", async ({ page, request }) => {
  const session = await Effect.runPromise(openDemo(page, request));
  try {
    await expect(page.getByRole("heading", { name: "Sidequest task board" })).toBeVisible();
    await page.waitForEvent("close", { timeout: 0 });
  } finally {
    await deleteUser(request, session.user.id);
  }
});
