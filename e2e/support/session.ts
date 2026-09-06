import { expect, type APIRequestContext, type BrowserContext } from "@playwright/test";

const E2E_SESSION_SECRET = "sidequest-e2e-session-helper-secret";

const E2E_SECRET_HEADER = "x-sidequest-e2e-secret";

type E2ESession = {
  cookies: Parameters<BrowserContext["addCookies"]>[0];
  user: {
    email: string;
    id: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBrowserCookie(
  value: unknown,
): value is Parameters<BrowserContext["addCookies"]>[0][number] {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.value === "string" &&
    typeof value.domain === "string" &&
    typeof value.path === "string"
  );
}

function isE2ESession(value: unknown): value is E2ESession {
  return (
    isRecord(value) &&
    Array.isArray(value.cookies) &&
    value.cookies.every(isBrowserCookie) &&
    isRecord(value.user) &&
    typeof value.user.email === "string" &&
    typeof value.user.id === "string"
  );
}

export async function createSession(request: APIRequestContext): Promise<E2ESession> {
  const response = await request.post("/api/e2e/session", {
    headers: { [E2E_SECRET_HEADER]: E2E_SESSION_SECRET },
  });

  if (response.status() !== 200) {
    expect(response.status(), await response.text()).toBe(200);
  }

  const session: unknown = await response.json();
  if (!isE2ESession(session)) {
    throw new Error("E2E session helper returned an invalid response");
  }

  return session;
}

export async function deleteUser(request: APIRequestContext, userId: string): Promise<void> {
  const response = await request.delete("/api/e2e/session", {
    data: { userId },
    headers: { [E2E_SECRET_HEADER]: E2E_SESSION_SECRET },
  });

  if (response.status() !== 204) {
    expect(response.status(), await response.text()).toBe(204);
  }
}
