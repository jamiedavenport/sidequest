import { expect, it, vi } from "vitest";
import { hasCalendarAccess } from "./access";
import { calendarScope } from "./schema";

vi.mock("~/auth/server", () => ({ createAuth: vi.fn() }));
vi.mock("~/db/client", () => ({ db: {} }));

it.each([
  `openid,email,profile,${calendarScope}`,
  `openid email profile ${calendarScope}`,
  `openid, email,profile, ${calendarScope}`,
])("recognizes granted Calendar permission in stored scopes: %s", (scope) => {
  expect(hasCalendarAccess({ scope, refreshToken: "encrypted-refresh-token" })).toBe(true);
});

it.each([
  { scope: "openid,email,profile", refreshToken: "encrypted-refresh-token" },
  { scope: `openid,email,${calendarScope}`, refreshToken: null },
  { scope: `openid,email,${calendarScope}.other`, refreshToken: "encrypted-refresh-token" },
])("requires the exact Calendar permission and a refresh token: %j", (account) => {
  expect(hasCalendarAccess(account)).toBe(false);
});
