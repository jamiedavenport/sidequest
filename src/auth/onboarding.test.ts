import { Effect } from "effect";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ seed: vi.fn(), send: vi.fn() }));

vi.mock("cloudflare:workers", () => ({
  env: { BOARD: { getByName: () => ({ seedOnboarding: mocks.seed }) } },
}));
vi.mock("~/db/client", () => ({ db: {} }));
vi.mock("~/env", () => ({
  env: {
    BETTER_AUTH_URL: new URL("http://localhost:3000"),
    BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
    RESEND_API_KEY: "test",
    GOOGLE_CLIENT_ID: "google-test-client",
    GOOGLE_CLIENT_SECRET: "google-test-secret",
  },
}));
vi.mock("~/server/runtime", () => ({ serverRuntime: { runPromise: Effect.runPromise } }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));
vi.mock("@better-auth/drizzle-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return {
    drizzleAdapter: () => memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  };
});
vi.mock("@better-auth/oauth-provider", () => ({ oauthProvider: () => ({ id: "oauth-test" }) }));
vi.mock("~/mcp/oauth", () => ({
  oauthOptions: () => ({}),
  mcpTokenPlugin: () => ({ id: "mcp-test" }),
}));
vi.mock("better-auth/tanstack-start", () => ({
  tanstackStartCookies: () => ({ id: "cookies-test" }),
}));

import { createAuth } from "~/auth/server";

beforeEach(() => {
  mocks.seed.mockReset().mockResolvedValue(true);
  mocks.send.mockReset().mockResolvedValue({ error: null });
});

it("seeds email OTP signup once and leaves subsequent sign-ins untouched", async () => {
  const auth = createAuth();
  const email = "otp@example.test";
  const otp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  const signup = await auth.api.signInEmailOTP({ body: { email, otp } });
  expect(mocks.seed).toHaveBeenCalledExactlyOnceWith(signup.user.id, undefined);
  const nextOtp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  await auth.api.signInEmailOTP({ body: { email, otp: nextOtp } });
  expect(mocks.seed).toHaveBeenCalledTimes(1);
});

it("awaits onboarding on the OAuth creation path even for unverified email", async () => {
  const auth = createAuth();
  const context = await auth.$context;
  let finish: ((value: boolean) => void) | undefined;
  mocks.seed.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  let settled = false;
  const pending = context.internalAdapter
    .createOAuthUser(
      {
        email: "oauth@example.test",
        name: "OAuth",
        emailVerified: false,
      },
      { providerId: "github", issuer: "https://github.com", accountId: "123" },
    )
    .then((result) => {
      settled = true;
      return result;
    });
  await vi.waitFor(() => expect(mocks.seed).toHaveBeenCalledTimes(1));
  expect(settled).toBe(false);
  finish?.(true);
  const result = await pending;
  expect(mocks.seed).toHaveBeenCalledWith(result.user.id, undefined);
  expect(mocks.send).not.toHaveBeenCalled();
});

it("logs seed failures without failing registration or suppressing the welcome email", async () => {
  mocks.seed.mockRejectedValue(new Error("fixture storage failure"));
  const auth = createAuth();
  const email = "failure@example.test";
  const otp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  const signup = await auth.api.signInEmailOTP({ body: { email, otp } });
  expect(signup.user.email).toBe(email);
  expect(mocks.seed).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it("requests only identity on Google login and incremental offline consent when linking from email", async () => {
  const auth = createAuth();
  const login = await auth.api.signInSocial({ body: { provider: "google", callbackURL: "/" } });
  const loginUrl = new URL(login.url!);
  expect(loginUrl.searchParams.get("scope")?.split(" ").toSorted()).toEqual([
    "email",
    "openid",
    "profile",
  ]);
  expect(loginUrl.searchParams.get("access_type")).toBe("online");

  const email = "calendar@example.test";
  const otp = await auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  const signedIn = await auth.api.signInEmailOTP({ body: { email, otp }, asResponse: true });
  const cookie = signedIn.headers.get("set-cookie")!.split(";")[0]!;
  const consent = await auth.api.linkSocialAccount({
    headers: new Headers({ cookie }),
    body: {
      provider: "google",
      scopes: ["https://www.googleapis.com/auth/calendar.app.created"],
      callbackURL: "/settings?calendar=connected",
      errorCallbackURL: "/settings?calendar=cancelled",
      additionalParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
  });
  const consentUrl = new URL(consent.url);
  expect(consentUrl.searchParams.get("scope")).toContain(
    "https://www.googleapis.com/auth/calendar.app.created",
  );
  expect(consentUrl.searchParams.get("access_type")).toBe("offline");
  expect(consentUrl.searchParams.get("prompt")).toBe("consent");
});
