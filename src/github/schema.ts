import { Effect, Schema } from "effect";

export const GitHubId = Schema.Int.check(Schema.isGreaterThan(0));

export const GitHubIssue = Schema.Struct({
  id: GitHubId,
  number: GitHubId,
  title: Schema.String,
  state: Schema.Literals(["open", "closed"]),
  pull_request: Schema.optionalKey(Schema.Unknown),
  labels: Schema.Array(Schema.Struct({ name: Schema.String })),
  assignees: Schema.Array(Schema.Struct({ id: GitHubId })),
});
export type GitHubIssue = typeof GitHubIssue.Type;

export const GitHubRepository = Schema.Struct({
  id: GitHubId,
  full_name: Schema.String.check(Schema.isPattern(/^[\w.-]+\/[\w.-]+$/)),
  has_issues: Schema.Boolean,
  archived: Schema.Boolean,
  permissions: Schema.Struct({
    admin: Schema.optionalKey(Schema.Boolean),
    maintain: Schema.optionalKey(Schema.Boolean),
    push: Schema.optionalKey(Schema.Boolean),
    triage: Schema.optionalKey(Schema.Boolean),
  }),
});
export type GitHubRepository = typeof GitHubRepository.Type;

export const GitHubInstallation = Schema.Struct({
  id: GitHubId,
  permissions: Schema.Struct({ issues: Schema.optionalKey(Schema.String) }),
  suspended_at: Schema.NullOr(Schema.String),
});

export const GitHubSettings = Schema.Struct({
  laneId: Schema.NonEmptyString,
  installationId: GitHubId,
  repositoryId: GitHubId,
  onlyAssigned: Schema.Boolean,
  labels: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))).check(
    Schema.isMaxLength(100),
  ),
});
export type GitHubSettings = typeof GitHubSettings.Type;

export class GitHubError extends Schema.TaggedError<GitHubError>()("GitHubError", {
  message: Schema.String,
}) {}

export function toGithubError(error: unknown): GitHubError {
  return error instanceof GitHubError
    ? error
    : new GitHubError({
        message: "GitHub is temporarily unavailable. Retry with Sync now.",
      });
}

export function canManageIssues(repository: GitHubRepository): boolean {
  const permissions = repository.permissions;
  return (
    repository.has_issues &&
    !repository.archived &&
    (permissions.admin || permissions.maintain || permissions.push || permissions.triage) === true
  );
}

export function fromGithubPromise<A>(run: () => PromiseLike<A>) {
  return Effect.tryPromise({ try: run, catch: toGithubError });
}
