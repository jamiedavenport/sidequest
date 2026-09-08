import { captureTelemetryContext } from "~/telemetry/runtime";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env as bindings } from "cloudflare:workers";
import { Effect, Schema } from "effect";
import { eq } from "drizzle-orm";
import { db } from "~/db/client";
import { githubConnection } from "~/db/schema/github";
import { createAuth } from "~/auth/server";
import { assertBillingOrigin } from "~/billing/security";
import { env } from "~/env";
import { runGithub } from "~/server/runtime";
import {
  getAccessibleRepos,
  getGithubAccount,
  getGithubRepoLabels,
  getGithubToken,
} from "./access";
import { fromGithubPromise, GitHubError, GitHubId, GitHubSettings, toGithubError } from "./schema";

const getGithubUserId = Effect.fn("getGithubUserId")(function* (mutation = false) {
  const headers = getRequestHeaders();
  if (mutation) {
    yield* Effect.try({
      try: () => assertBillingOrigin(headers, env.BETTER_AUTH_URL.href),
      catch: () => new GitHubError({ message: "Invalid request origin." }),
    });
  }
  const session = yield* fromGithubPromise(() => createAuth().api.getSession({ headers }));
  if (!session) {
    return yield* new GitHubError({ message: "Sign in to configure GitHub." });
  }
  return session.user.id;
});

// Board RPC methods already sanitize errors; preserve their actionable messages.
function fromGithubRpc<A>(run: () => PromiseLike<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (error) =>
      new GitHubError({
        message: error instanceof Error ? error.message : toGithubError(error).message,
      }),
  });
}

const LaneInput = Schema.toStandardSchemaV1(Schema.Struct({ laneId: Schema.NonEmptyString }));

export const isGithubEnabled = createServerFn({ method: "GET" }).handler(
  () => !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
);

export const getGithubLaneConnections = createServerFn({ method: "GET" }).handler(() =>
  runGithub(
    Effect.gen(function* () {
      const userId = yield* getGithubUserId();
      return yield* fromGithubPromise(() =>
        db
          .select({ laneId: githubConnection.laneId, repository: githubConnection.repository })
          .from(githubConnection)
          .where(eq(githubConnection.userId, userId)),
      );
    }),
  ),
);

export const getGithubStatus = createServerFn({ method: "GET" })
  .validator(LaneInput)
  .handler(({ data }) =>
    runGithub(
      Effect.gen(function* () {
        const userId = yield* getGithubUserId();
        const linkedAccount = yield* getGithubAccount(userId);
        const connection = yield* fromGithubRpc(() =>
          bindings.BOARD.getByName(userId).getGithubStatus(
            userId,
            data.laneId,
            captureTelemetryContext(),
          ),
        );
        return {
          enabled: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_APP_SLUG),
          linked: !!linkedAccount,
          installUrl: env.GITHUB_APP_SLUG
            ? `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`
            : null,
          status: connection ? { repository: connection.repository } : null,
        };
      }),
    ),
  );

export const getGithubRepos = createServerFn({ method: "GET" }).handler(() =>
  runGithub(
    Effect.gen(function* () {
      const userId = yield* getGithubUserId();
      const token = yield* getGithubToken(userId);
      return yield* getAccessibleRepos(token);
    }),
  ),
);

export const getGithubLabels = createServerFn({ method: "GET" })
  .validator(
    Schema.toStandardSchemaV1(Schema.Struct({ installationId: GitHubId, repositoryId: GitHubId })),
  )
  .handler(({ data }) =>
    runGithub(
      Effect.gen(function* () {
        const userId = yield* getGithubUserId();
        return yield* getGithubRepoLabels(userId, data.installationId, data.repositoryId);
      }),
    ),
  );

export const saveGithubSettings = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(GitHubSettings))
  .handler(({ data }) =>
    runGithub(
      Effect.gen(function* () {
        const userId = yield* getGithubUserId(true);
        yield* fromGithubRpc(() =>
          bindings.BOARD.getByName(userId).saveGithubSettings(
            userId,
            data,
            captureTelemetryContext(),
          ),
        );
        return { ok: true };
      }),
    ),
  );

export const syncGithubNow = createServerFn({ method: "POST" })
  .validator(LaneInput)
  .handler(({ data }) =>
    runGithub(
      Effect.gen(function* () {
        const userId = yield* getGithubUserId(true);
        yield* fromGithubRpc(() =>
          bindings.BOARD.getByName(userId).syncGithubNow(
            userId,
            data.laneId,
            captureTelemetryContext(),
          ),
        );
        return { ok: true };
      }),
    ),
  );

export const disconnectGithubLane = createServerFn({ method: "POST" })
  .validator(LaneInput)
  .handler(({ data }) =>
    runGithub(
      Effect.gen(function* () {
        const userId = yield* getGithubUserId(true);
        yield* fromGithubRpc(() =>
          bindings.BOARD.getByName(userId).disconnectGithubLane(
            userId,
            data.laneId,
            captureTelemetryContext(),
          ),
        );
        return { ok: true };
      }),
    ),
  );
