import { and, eq } from "drizzle-orm";
import { Effect, Option, Schema, Stream } from "effect";
import { createAuth } from "~/auth/server";
import { db } from "~/db/client";
import { account } from "~/db/schema";
import { GitHubApi } from "./api";
import {
  canManageIssues,
  fromGithubPromise,
  GitHubError,
  GitHubInstallation,
  GitHubRepository,
} from "./schema";

export const getGithubAccount = Effect.fn("getGithubAccount")(function* (userId: string) {
  return yield* fromGithubPromise(() =>
    db
      .select()
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
      .get(),
  );
});

export const getGithubToken = Effect.fn("getGithubToken")(
  function* (userId: string) {
    const linkedAccount = yield* getGithubAccount(userId);
    if (!linkedAccount) {
      return yield* new GitHubError({ message: "GitHub account is not connected." });
    }
    const result = yield* fromGithubPromise(() =>
      createAuth().api.getAccessToken({
        body: { accountId: linkedAccount.id, userId },
      }),
    );
    if (!result.accessToken) {
      return yield* new GitHubError({ message: "GitHub access token is missing." });
    }
    return result.accessToken;
  },
  Effect.mapError(
    () => new GitHubError({ message: "Reconnect your GitHub account, then use Sync now." }),
  ),
);

function streamGithubPages<A, E, R>(
  fetchPage: (page: number) => Effect.Effect<ReadonlyArray<A>, E, R>,
) {
  return Stream.paginate(
    1,
    Effect.fn("getGithubPage")(function* (page: number) {
      const items = yield* fetchPage(page);
      return [items, items.length === 100 ? Option.some(page + 1) : Option.none()] as const;
    }),
  );
}

function streamGithubInstallations(token: string) {
  return streamGithubPages((page) =>
    GitHubApi.use((api) =>
      api.request(
        token,
        `/user/installations?per_page=100&page=${page}`,
        Schema.Struct({ installations: Schema.Array(GitHubInstallation) }),
      ),
    ).pipe(Effect.map((result) => result.installations)),
  );
}

function streamGithubRepos(token: string, installationId: number) {
  return streamGithubPages((page) =>
    GitHubApi.use((api) =>
      api.request(
        token,
        `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
        Schema.Struct({ repositories: Schema.Array(GitHubRepository) }),
      ),
    ).pipe(Effect.map((result) => result.repositories)),
  );
}

export const getAccessibleRepos = Effect.fn("getAccessibleRepos")(function* (token: string) {
  return yield* streamGithubInstallations(token).pipe(
    Stream.filter(
      (installation) =>
        installation.suspended_at === null && installation.permissions.issues === "write",
    ),
    Stream.flatMap((installation) =>
      streamGithubRepos(token, installation.id).pipe(
        Stream.filter(canManageIssues),
        Stream.map((repo) => ({
          installationId: installation.id,
          id: repo.id,
          name: repo.full_name,
        })),
      ),
    ),
    Stream.runCollect,
  );
});

const getAccessibleRepo = Effect.fn("getAccessibleRepo")(function* (
  token: string,
  installationId: number,
  repositoryId: number,
) {
  const repositories = yield* getAccessibleRepos(token);
  const repository = repositories.find(
    (repo) => repo.id === repositoryId && repo.installationId === installationId,
  );
  if (!repository) {
    return yield* new GitHubError({
      message:
        "Manage repository access and grant Issues write permission, then use Sync now. Organization approval may still be pending.",
    });
  }
  return repository;
});

export const getGithubRepoAccess = Effect.fn("getGithubRepoAccess")(function* (
  userId: string,
  installationId: number,
  repositoryId: number,
) {
  const token = yield* getGithubToken(userId);
  const repo = yield* getAccessibleRepo(token, installationId, repositoryId);
  return { token, repo };
});

export const getGithubRepoLabels = Effect.fn("getGithubRepoLabels")(function* (
  userId: string,
  installationId: number,
  repositoryId: number,
) {
  const { token, repo } = yield* getGithubRepoAccess(userId, installationId, repositoryId);
  const api = yield* GitHubApi;
  return yield* streamGithubPages((page) =>
    api.request(
      token,
      `/repos/${repo.name}/labels?per_page=100&page=${page}`,
      Schema.Array(Schema.Struct({ name: Schema.String })),
    ),
  ).pipe(
    Stream.map((label) => label.name),
    Stream.runCollect,
  );
});
