import { Schema } from "effect";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { mcpTokenPlugin, oauthOptions } from "~/mcp/oauth";
import { oauthQueryFromSearch } from "~/auth/oauth-continuation";

const origin = "http://localhost:3000";

const redirectUri = "http://localhost:9876/callback";

function fixture() {
  const options = oauthOptions(origin);
  const provider = oauthProvider(options);
  const tables = Object.fromEntries(
    ["user", "session", "account", "verification", ...Object.keys(provider.schema)].map((name) => [
      name,
      [],
    ]),
  );
  const auth = betterAuth({
    baseURL: origin,
    secret: "test-only-secret-with-at-least-32-characters",
    database: memoryAdapter(tables),
    rateLimit: { enabled: false },
    plugins: [provider, mcpTokenPlugin(options), emailOTP({ async sendVerificationOTP() {} })],
  });
  const post = (path: string, body: object, cookie = "") => {
    const form = path === "/oauth2/token" || path === "/oauth2/revoke";
    return auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: "POST",
        headers: {
          "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json",
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: form
          ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)]))
          : JSON.stringify(body),
      }),
    );
  };
  return { auth, post };
}

async function setup() {
  const f = fixture();
  const registration = await f.post("/oauth2/register", {
    client_name: "Test app",
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: "none",
    application_type: "native",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
  expect(registration.status, await registration.clone().text()).toBe(201);
  const registered = Schema.decodeUnknownSync(Schema.Struct({ client_id: Schema.String }))(
    await registration.json(),
  );
  const clientId: string = registered.client_id;
  const verifier = "a".repeat(64);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "sidequest:read sidequest:write offline_access",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${origin}/mcp`,
    state: "state",
    prompt: "consent",
  });
  const authorize = (query = params, cookie = "") =>
    f.auth.handler(
      new Request(`${origin}/api/auth/oauth2/authorize?${query}`, {
        headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      }),
    );
  return { ...f, authorize, params, clientId, verifier };
}

async function responseUrl(response: Response): Promise<string> {
  const location = response.headers.get("location");
  if (location) {
    return location;
  }
  const body = Schema.decodeUnknownSync(Schema.Struct({ url: Schema.String }))(
    await response.json(),
  );
  expect(body, JSON.stringify(body)).toHaveProperty("url");
  return body.url;
}

describe("OAuth provider integration", () => {
  it("preserves signed continuation through email OTP and rejects tampering", async () => {
    const f = await setup();
    const url = await responseUrl(await f.authorize());
    expect(new URL(url, origin).pathname).toBe("/login");
    const query = oauthQueryFromSearch(new URL(url, origin).search)!;
    expect(oauthQueryFromSearch(`?email=a%40b.com&oauthQuery=${encodeURIComponent(query)}`)).toBe(
      query,
    );
    const metadata = await f.auth.api.getOAuthClientPublicPrelogin({
      body: { client_id: f.clientId, oauth_query: query },
    });
    expect(metadata.client_name).toBe("Test app");
    await expect(
      f.auth.api.getOAuthClientPublicPrelogin({
        body: { client_id: f.clientId, oauth_query: `${query}&scope=sidequest:write` },
      }),
    ).rejects.toThrow();
    const email = "test@example.com";
    const otp = await f.auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
    const signIn = await f.post("/sign-in/email-otp", { email, otp, oauth_query: query });
    expect(signIn.status, await signIn.clone().text()).toBe(200);
    const cookie = signIn.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const consentUrl = await responseUrl(signIn);
    expect(new URL(consentUrl, origin).pathname).toBe("/consent");
    const consentQuery = oauthQueryFromSearch(new URL(consentUrl, origin).search)!;
    const consent = await f.post(
      "/oauth2/consent",
      { accept: true, scope: "sidequest:read offline_access", oauth_query: consentQuery },
      cookie,
    );
    const callback = new URL(await responseUrl(consent));
    expect(callback.searchParams.get("state")).toBe("state");
    const token = await f.post("/oauth2/token", {
      grant_type: "authorization_code",
      client_id: f.clientId,
      code: callback.searchParams.get("code"),
      redirect_uri: redirectUri,
      code_verifier: f.verifier,
      resource: `${origin}/mcp`,
    });
    expect(token.status, await token.clone().text()).toBe(200);
    const issued = Schema.decodeUnknownSync(
      Schema.Struct({
        scope: Schema.String,
        access_token: Schema.String,
        refresh_token: Schema.String,
      }),
    )(await token.json());
    expect(issued.scope).toBe("sidequest:read offline_access");
    expect(issued.access_token.split(".")).toHaveLength(1);
    const active = await f.auth.api.validateMcpToken({
      headers: new Headers({ Authorization: `Bearer ${issued.access_token}` }),
    });
    expect(active).toMatchObject({ active: true, aud: `${origin}/mcp`, client_id: f.clientId });
    expect(active.sub).toBeTruthy();
    const refreshed = await f.post("/oauth2/token", {
      grant_type: "refresh_token",
      client_id: f.clientId,
      refresh_token: issued.refresh_token,
      resource: `${origin}/mcp`,
    });
    expect(refreshed.status).toBe(200);
    const revoke = await f.post("/oauth2/revoke", {
      client_id: f.clientId,
      token: issued.access_token,
      token_type_hint: "access_token",
    });
    expect(revoke.status).toBe(200);
    await expect(
      f.auth.api.validateMcpToken({
        headers: new Headers({ Authorization: `Bearer ${issued.access_token}` }),
      }),
    ).rejects.toThrow();
  });

  it("rejects missing PKCE and unregistered redirect URIs", async () => {
    const f = await setup();
    const missingPkce = new URLSearchParams(f.params);
    missingPkce.delete("code_challenge");
    missingPkce.delete("code_challenge_method");
    const rejected = await f.authorize(missingPkce);
    const error = await rejected.text();
    expect(error).toContain("invalid_request");
    const wrongRedirect = new URLSearchParams(f.params);
    wrongRedirect.set("redirect_uri", "https://attacker.invalid/callback");
    const wrong = await f.authorize(wrongRedirect);
    const deniedUrl = new URL(await responseUrl(wrong), origin);
    expect(deniedUrl.origin).toBe(origin);
    expect(deniedUrl.search).toContain("invalid_redirect");
  });

  it("returns access_denied when consent is rejected", async () => {
    const f = await setup();
    const email = "deny@example.com";
    const otp = await f.auth.api.createVerificationOTP({ body: { email, type: "sign-in" } });
    const login = await f.post("/sign-in/email-otp", { email, otp });
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const url = await responseUrl(await f.authorize(f.params, cookie));
    const denied = await f.post(
      "/oauth2/consent",
      { accept: false, oauth_query: oauthQueryFromSearch(new URL(url, origin).search) },
      cookie,
    );
    const callback = new URL(await responseUrl(denied));
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.has("code")).toBe(false);
  });
});
