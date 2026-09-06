import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "~/db/client";
import * as schema from "~/db/schema";
import { env } from "~/env";

const E2E_SECRET_HEADER = "x-sidequest-e2e-secret";

const LOCAL_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

const e2eAuth = betterAuth({
  baseURL: env.BETTER_AUTH_URL.href,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  secret: env.BETTER_AUTH_SECRET,
  plugins: [testUtils(), tanstackStartCookies()],
});

function isEnabled(request: Request): boolean {
  const sessionSecret = process.env.E2E_SESSION_SECRET;

  return (
    process.env.E2E_MODE === "1" &&
    sessionSecret !== undefined &&
    request.headers.get(E2E_SECRET_HEADER) === sessionSecret &&
    LOCAL_HOSTS.has(env.BETTER_AUTH_URL.hostname) &&
    LOCAL_HOSTS.has(new URL(request.url).hostname)
  );
}

function disabledResponse(): Response {
  return new Response(null, { status: 404 });
}

export async function createE2ESession(request: Request): Promise<Response> {
  if (!isEnabled(request)) {
    return disabledResponse();
  }

  const { test } = await e2eAuth.$context;
  const user = test.createUser({
    email: `e2e-${crypto.randomUUID()}@example.test`,
    name: "Sidequest E2E User",
  });
  const savedUser = await test.saveUser(user);
  const { cookies } = await test.login({ userId: savedUser.id });

  return Response.json({
    cookies,
    user: {
      email: savedUser.email,
      id: savedUser.id,
    },
  });
}

export async function deleteE2EUser(request: Request): Promise<Response> {
  if (!isEnabled(request)) {
    return disabledResponse();
  }

  const body: unknown = await request.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("userId" in body) ||
    typeof body.userId !== "string" ||
    body.userId.length === 0
  ) {
    return Response.json({ error: "Invalid E2E user id" }, { status: 400 });
  }

  const { test } = await e2eAuth.$context;
  await test.deleteUser(body.userId);

  return new Response(null, { status: 204 });
}
