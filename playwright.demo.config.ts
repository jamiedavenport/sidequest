import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

const screenshots = process.env.DEMO_SCREENSHOTS === "1";

export default defineConfig(config, {
  testDir: "./scripts",
  testMatch: "demo.ts",
  timeout: screenshots ? 120_000 : 0,
  retries: 0,
  reporter: "list",
  projects: [
    {
      name: "chromium",
      use: {
        viewport: screenshots ? { width: 1392, height: 982 } : { width: 1512, height: 982 },
        deviceScaleFactor: screenshots ? 2 : 1,
      },
    },
  ],
  use: {
    headless: screenshots,
    locale: screenshots ? "en-GB" : undefined,
    timezoneId: screenshots ? "UTC" : undefined,
    colorScheme: screenshots ? "light" : undefined,
    contextOptions: { reducedMotion: screenshots ? "reduce" : "no-preference" },
    trace: "off",
    screenshot: screenshots ? "only-on-failure" : "off",
  },
});
