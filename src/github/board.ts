import { and, eq } from "drizzle-orm";
import { Effect, Option, Stream } from "effect";
import type { Task } from "~/board/schema";
import { planTaskCreate } from "~/board/data/task-planning";
import { createDatabase } from "~/db/database";
import { githubConnection, type GitHubConnection } from "~/db/schema/github";
import { getGithubRepoAccess } from "./access";
import type { GitHubApi } from "./api";
import { closeGithubIssue, getGithubIssuePage } from "./sync";
import { fromGithubPromise, GitHubError, type GitHubIssue, type GitHubSettings } from "./schema";

function createIssueTask(
  tasks: ReadonlyArray<Task>,
  connection: GitHubConnection,
  issue: GitHubIssue,
): Task {
  return {
    ...planTaskCreate(tasks, {
      id: `github-${issue.id}`,
      viewId: connection.laneId,
      title: issue.title,
    }),
    attachments: [
      {
        id: `github-${issue.id}`,
        type: "github-issue",
        issueId: issue.id,
        repositoryId: connection.repositoryId,
        number: issue.number,
        repository: connection.repository,
        title: issue.title,
        href: `https://github.com/${connection.repository}/issues/${issue.number}`,
      },
    ],
  };
}

export class GitHubBoard {
  constructor(
    private readonly board: {
      storage: {
        get<T>(key: string): Promise<T | undefined>;
        put(entries: Record<string, unknown>): Promise<void>;
      };
      database: D1Database;
      tasks: () => ReadonlyArray<Task>;
      laneExists: (id: string) => boolean;
      insert: (tasks: ReadonlyArray<Task>) => Promise<void>;
      broadcast: () => Promise<void>;
      canWrite: () => Promise<boolean>;
      serialized: <A>(
        work: Effect.Effect<A, GitHubError, GitHubApi>,
      ) => Effect.Effect<A, GitHubError, GitHubApi>;
    },
  ) {}

  private getOwnerId = Effect.fn("GitHubBoard.getOwnerId")(function* (this: GitHubBoard) {
    const ownerId = yield* fromGithubPromise(() => this.board.storage.get<string>("billing:owner"));
    if (!ownerId) {
      return yield* new GitHubError({ message: "Board owner is missing." });
    }
    return ownerId;
  });

  private getConnections = Effect.fn("GitHubBoard.getConnections")(function* (this: GitHubBoard) {
    const ownerId = yield* this.getOwnerId();
    return yield* fromGithubPromise(() =>
      createDatabase(this.board.database)
        .select()
        .from(githubConnection)
        .where(eq(githubConnection.userId, ownerId)),
    );
  });

  private requireWriteAccess = Effect.fn("GitHubBoard.requireWriteAccess")(
    function* (this: GitHubBoard): Effect.fn.Return<void, GitHubError> {
      if (yield* fromGithubPromise(() => this.board.canWrite())) {
        return undefined;
      }
      return yield* new GitHubError({ message: "Update billing to sync GitHub." });
    },
  );

  private getActiveConnection = Effect.fn("GitHubBoard.getActiveConnection")(function* (
    this: GitHubBoard,
    id: string,
  ) {
    const connection = (yield* this.getConnections()).find((candidate) => candidate.id === id);
    if (!connection || !this.board.laneExists(connection.laneId)) {
      return undefined;
    }
    yield* this.requireWriteAccess();
    return connection;
  });

  getLaneConnection = Effect.fn("GitHubBoard.getLaneConnection")(function* (
    this: GitHubBoard,
    laneId: string,
  ) {
    if (!this.board.laneExists(laneId)) {
      return yield* new GitHubError({
        message: "Sync this custom lane online before configuring GitHub.",
      });
    }
    return (
      (yield* this.getConnections()).find((connection) => connection.laneId === laneId) ?? null
    );
  });

  saveSettings = Effect.fn("GitHubBoard.saveSettings")(function* (
    this: GitHubBoard,
    settings: GitHubSettings,
  ) {
    const userId = yield* this.board.serialized(this.getOwnerId());
    const { repo } = yield* getGithubRepoAccess(
      userId,
      settings.installationId,
      settings.repositoryId,
    );
    const connection = yield* this.board.serialized(
      this.saveConnection({
        ...settings,
        labels: [...new Set(settings.labels)],
        // A new identity invalidates imports still fetching with the previous settings.
        id: crypto.randomUUID(),
        userId,
        repository: repo.name,
      }),
    );
    yield* this.importIssues(connection.id);
  });

  private saveConnection = Effect.fn("GitHubBoard.saveConnection")(function* (
    this: GitHubBoard,
    connection: GitHubConnection,
  ) {
    yield* this.requireWriteAccess();
    const previous = yield* this.getLaneConnection(connection.laneId);
    if (previous && previous.repositoryId !== connection.repositoryId) {
      return yield* new GitHubError({
        message: "Disconnect this lane before choosing a different repository.",
      });
    }
    const connections = yield* this.getConnections();
    if (
      connections.some(
        (other) =>
          other.laneId !== connection.laneId && other.repositoryId === connection.repositoryId,
      )
    ) {
      return yield* new GitHubError({
        message: "This repository is already connected to another lane.",
      });
    }
    yield* fromGithubPromise(() =>
      createDatabase(this.board.database)
        .insert(githubConnection)
        .values(connection)
        .onConflictDoUpdate({
          target: [githubConnection.userId, githubConnection.laneId],
          set: connection,
        }),
    );
    return connection;
  });

  disconnectLane = Effect.fn("GitHubBoard.disconnectLane")(function* (
    this: GitHubBoard,
    laneId: string,
  ) {
    const ownerId = yield* this.getOwnerId();
    yield* fromGithubPromise(() =>
      createDatabase(this.board.database)
        .delete(githubConnection)
        .where(and(eq(githubConnection.userId, ownerId), eq(githubConnection.laneId, laneId))),
    );
  });

  syncLane = Effect.fn("GitHubBoard.syncLane")(function* (
    this: GitHubBoard,
    laneId: string,
  ): Effect.fn.Return<void, GitHubError, GitHubApi> {
    const connection = yield* this.board.serialized(this.getLaneConnection(laneId));
    if (!connection) {
      return yield* new GitHubError({ message: "Connect this lane first." });
    }
    return yield* this.importIssues(connection.id);
  });

  importIssues = Effect.fn("GitHubBoard.importIssues")(function* (
    this: GitHubBoard,
    id: string,
    issueNumber?: number,
  ) {
    const connection = yield* this.board.serialized(this.getActiveConnection(id));
    if (!connection) {
      return;
    }
    yield* Stream.paginate(1, (page) => this.importIssuePage(connection, page, issueNumber)).pipe(
      Stream.runDrain,
    );
  });

  private importIssuePage = Effect.fn("GitHubBoard.importIssuePage")(function* (
    this: GitHubBoard,
    connection: GitHubConnection,
    page: number,
    issueNumber?: number,
  ) {
    const result = yield* getGithubIssuePage(connection, page, issueNumber);
    const active = yield* this.board.serialized(
      this.applyIssuePage({ ...connection, repository: result.repository }, result.issues),
    );
    return [[], active && result.hasMore ? Option.some(page + 1) : Option.none()] as const;
  });

  private applyIssuePage = Effect.fn("GitHubBoard.applyIssuePage")(function* (
    this: GitHubBoard,
    connection: GitHubConnection,
    issues: ReadonlyArray<GitHubIssue>,
  ) {
    if (!(yield* this.getActiveConnection(connection.id))) {
      return false;
    }
    // Keep markers after task deletion so later deliveries cannot recreate imported issues.
    const newIssues = yield* Effect.filter(issues, (issue) =>
      fromGithubPromise(() => this.board.storage.get(`github:issue:${issue.id}`)).pipe(
        Effect.map((marker) => marker === undefined),
      ),
    );
    if (newIssues.length === 0) {
      return true;
    }
    const tasks: Task[] = [];
    for (const issue of newIssues) {
      tasks.push(createIssueTask([...this.board.tasks(), ...tasks], connection, issue));
    }
    yield* fromGithubPromise(() => this.board.insert(tasks));
    yield* fromGithubPromise(() =>
      this.board.storage.put(
        Object.fromEntries(newIssues.map((issue) => [`github:issue:${issue.id}`, true])),
      ),
    );
    yield* fromGithubPromise(() => this.board.broadcast());
    return true;
  });

  private getCompletedIssues = Effect.fn("GitHubBoard.getCompletedIssues")(function* (
    this: GitHubBoard,
    taskIds: ReadonlyArray<string>,
  ) {
    yield* this.requireWriteAccess();
    const connections = yield* this.getConnections();
    const tasks = new Map(this.board.tasks().map((task) => [task.id, task]));
    return taskIds.flatMap((taskId) => {
      const task = tasks.get(taskId);
      if (!task?.completed) {
        return [];
      }
      return (task.attachments ?? []).flatMap((attachment) => {
        if (attachment.type !== "github-issue") {
          return [];
        }
        const connection = connections.find(
          (candidate) =>
            candidate.repositoryId === attachment.repositoryId &&
            this.board.laneExists(candidate.laneId),
        );
        return connection ? [{ taskId, connection, attachment }] : [];
      });
    });
  });

  closeCompletedIssues = Effect.fn("GitHubBoard.closeCompletedIssues")(function* (
    this: GitHubBoard,
    taskIds: ReadonlyArray<string>,
  ) {
    const issues = yield* this.board.serialized(this.getCompletedIssues(taskIds));
    yield* Effect.forEach(
      issues,
      ({ taskId, connection, attachment }) =>
        closeGithubIssue(connection, attachment.number, attachment.issueId).pipe(
          Effect.catch((error) =>
            Effect.logWarning("github.closure_failed", { taskId, message: error.message }),
          ),
        ),
      { discard: true, concurrency: 4 },
    );
  });
}
