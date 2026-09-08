import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig(config, {
  testDir: "./scripts",
  testMatch: "demo.ts",
  timeout: 0,
  retries: 0,
  reporter: "list",
  use: { headless: false, viewport: { width: 1512, height: 982 }, trace: "off", screenshot: "off" },
});
