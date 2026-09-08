import { env as bindings } from "cloudflare:workers";
import { isE2EEnabled } from "~/auth/e2e-guard";
import { BoardSeedError, SeedOptions } from "~/board/seeds/schema";
import { eq } from "drizzle-orm";
import { Clock, Effect, Schema } from "effect";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { testUtils } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db } from "~/db/client";
import * as schema from "~/db/schema";
import { env } from "~/env";
import { serverRuntime } from "~/server/runtime";

const E2E_SECRET_HEADER = "x-sidequest-e2e-secret";

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
  return isE2EEnabled(env, request.url, request.headers.get(E2E_SECRET_HEADER));
}

function disabledResponse(): Response {
  return new Response(null, { status: 404 });
}

const createSession = Effect.fn("createSession")(function* (request: Request) {
  const { test } = yield* Effect.tryPromise({
    try: () => e2eAuth.$context,
    catch: () => new E2ESessionError(),
  });
  const params = new URL(request.url).searchParams;
  const existingUserId = params.get("userId");
  if (existingUserId !== null) {
    const { cookies } = yield* Effect.tryPromise({
      try: () => test.login({ userId: existingUserId }),
      catch: () => new E2ESessionError(),
    });
    return Response.json({ cookies });
  }
  const options = yield* Schema.decodeUnknownEffect(SeedOptions)({
    ...(params.has("seed") ? { seed: params.get("seed") } : {}),
    ...(params.has("anchorDate") ? { anchorDate: params.get("anchorDate") } : {}),
  });
  const user = test.createUser({
    email: `e2e-${crypto.randomUUID()}@example.test`,
    name: options.seed === "demo" ? "Sidequest Demo" : "Sidequest E2E User",
  });
  const savedUser = yield* Effect.tryPromise({
    try: () => test.saveUser(user),
    catch: () => new E2ESessionError(),
  });
  if (options.seed !== undefined && options.seed !== "empty") {
    yield* Effect.tryPromise({
      try: () =>
        bindings.BOARD.getByName(savedUser.id).seedE2E(
          savedUser.id,
          options,
          request.url,
          request.headers.get(E2E_SECRET_HEADER),
        ),
      catch: () => new BoardSeedError({ message: "Could not create E2E board fixture." }),
    });
  }
  const { cookies } = yield* Effect.tryPromise({
    try: () => test.login({ userId: savedUser.id }),
    catch: () => new E2ESessionError(),
  });
  return Response.json({ cookies, user: { email: savedUser.email, id: savedUser.id } });
});

export function createE2ESession(request: Request): Promise<Response> {
  if (!isEnabled(request)) {
    return Promise.resolve(disabledResponse());
  }
  return serverRuntime.runPromise(
    createSession(request).pipe(
      Effect.catchTags({
        SchemaError: () =>
          Effect.succeed(Response.json({ error: "Invalid seed options." }, { status: 400 })),
        BoardSeedError: (error) =>
          Effect.succeed(Response.json({ error: error.message }, { status: 500 })),
      }),
    ),
  );
}

class E2ESessionError extends Schema.TaggedError<E2ESessionError>()("E2ESessionError", {}) {}

const setSessionExpiry = Effect.fn("setSessionExpiry")(function* (request: Request) {
  const input = yield* Effect.tryPromise({
    try: () => request.json(),
    catch: () => new E2ESessionError(),
  });
  const body = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      sessionId: Schema.NonEmptyString,
      expiresInMs: Schema.Number,
    }),
  )(input);
  const now = yield* Clock.currentTimeMillis;
  yield* Effect.tryPromise({
    try: () =>
      db
        .update(schema.session)
        .set({ expiresAt: new Date(now + body.expiresInMs) })
        .where(eq(schema.session.id, body.sessionId)),
    catch: () => new E2ESessionError(),
  });
  return new Response(null, { status: 204 });
});

export function expireE2ESession(request: Request): Promise<Response> {
  if (!isEnabled(request)) {
    return Promise.resolve(disabledResponse());
  }
  return serverRuntime.runPromise(setSessionExpiry(request));
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

export async function ageE2EUser(request: Request): Promise<Response> {
  if (!isEnabled(request)) {
    return disabledResponse();
  }
  const body = Schema.decodeUnknownSync(
    Schema.Struct({ userId: Schema.String, ageDays: Schema.Number }),
  )(await request.json());
  await db
    .update(schema.user)
    .set({ createdAt: new Date(Date.now() - body.ageDays * 86_400_000) })
    .where(eq(schema.user.id, body.userId));
  return new Response(null, { status: 204 });
}
