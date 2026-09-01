import { test, type Page } from "@playwright/test";

export type ManualCheckpoint = "after-connect" | "after-insert" | "after-update";

export async function pauseAt(page: Page, checkpoint: ManualCheckpoint): Promise<void> {
  if (process.env.CI || process.env.E2E_INTERACTIVE !== "1") {
    return;
  }

  const requested = new Set(
    (process.env.E2E_PAUSE_AT ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  if (!requested.has("all") && !requested.has(checkpoint)) {
    return;
  }

  await test.step(`manual pause: ${checkpoint}`, () => page.pause());
}
