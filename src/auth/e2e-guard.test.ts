import { expect, it } from "vitest";
import { isE2EEnabled } from "~/auth/e2e-guard";

it("requires local request and auth hosts, explicit E2E mode and the session secret", () => {
  const config = {
    E2E_MODE: "1",
    E2E_SESSION_SECRET: "test-secret",
    BETTER_AUTH_URL: new URL("http://localhost:4173"),
  };
  expect(isE2EEnabled(config, "http://127.0.0.1:4173", "test-secret")).toBe(true);
  expect(isE2EEnabled(config, "https://example.com", "test-secret")).toBe(false);
  expect(isE2EEnabled(config, "http://localhost:4173", null)).toBe(false);
  expect(isE2EEnabled(config, "http://localhost:4173", "wrong")).toBe(false);
  expect(isE2EEnabled({ ...config, E2E_MODE: "0" }, "http://localhost:4173", "test-secret")).toBe(
    false,
  );
  expect(
    isE2EEnabled({ ...config, E2E_SESSION_SECRET: undefined }, "http://localhost:4173", null),
  ).toBe(false);
  expect(
    isE2EEnabled(
      { ...config, BETTER_AUTH_URL: new URL("https://sdqst.app") },
      "http://localhost:4173",
      "test-secret",
    ),
  ).toBe(false);
});
