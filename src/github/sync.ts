import { Effect, Schema } from "effect";
import type { GitHubConnection } from "~/db/schema/github";
import { GitHubApi } from "./api";
import { getGithubRepoAccess } from "./access";
import { GitHubError, GitHubId, GitHubIssue } from "./schema";

export const getGithubIssuePage = Effect.fn("getGithubIssuePage")(function* (
  connection: GitHubConnection,
  page: number,
  issueNumber?: number,
) {
  const { token, repo } = yield* getGithubRepoAccess(
    connection.userId,
    connection.installationId,
    connection.repositoryId,
  );
  const api = yield* GitHubApi;
  const path = `/repos/${repo.name}/issues`;
  const issues =
    issueNumber === undefined
      ? yield* api.request(
          token,
          `${path}?state=open&sort=created&direction=asc&per_page=100&page=${page}`,
          Schema.Array(GitHubIssue),
        )
      : [yield* api.request(token, `${path}/${issueNumber}`, GitHubIssue)];
  const assignee = connection.onlyAssigned
    ? yield* api.request(token, "/user", Schema.Struct({ id: GitHubId }))
    : undefined;
  return {
    repository: repo.name,
    hasMore: issueNumber === undefined && issues.length === 100,
    issues: issues.filter(
      (issue) =>
        issue.state === "open" &&
        issue.pull_request === undefined &&
        (!assignee || issue.assignees.some((user) => user.id === assignee.id)) &&
        connection.labels.every((label) =>
          issue.labels.some((issueLabel) => issueLabel.name === label),
        ),
    ),
  };
});

export const closeGithubIssue = Effect.fn("closeGithubIssue")(function* (
  connection: GitHubConnection,
  issueNumber: number,
  issueId: number,
): Effect.fn.Return<void, GitHubError, GitHubApi> {
  const { token, repo } = yield* getGithubRepoAccess(
    connection.userId,
    connection.installationId,
    connection.repositoryId,
  );
  const api = yield* GitHubApi;
  const path = `/repos/${repo.name}/issues/${issueNumber}`;
  const issue = yield* api.request(token, path, GitHubIssue);
  if (issue.id !== issueId || issue.pull_request !== undefined) {
    return yield* new GitHubError({
      message:
        "The linked GitHub issue has moved or is no longer accessible. Check repository access.",
    });
  }
  if (issue.state === "closed") {
    return undefined;
  }
  yield* api.request(token, path, GitHubIssue, { state: "closed", state_reason: "completed" });
  return undefined;
});
