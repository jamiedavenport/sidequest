import { serverRuntime } from "~/server/runtime";
import { fromGithubPromise } from "./schema";
import type * as SchemaType from "effect/Schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "~/db/test-database";
import { githubConnection, user } from "~/db/schema";
import type { Task } from "~/board/schema";
import { GitHubBoard } from "./board";

const github = vi.hoisted(() => ({
  failedClosures: 0,
  patches: 0,
  closed: false,
  pages: false,
  beforeRequest: undefined as (() => Promise<void>) | undefined,
}));

vi.mock("./access", async () => {
  const { Effect } = await import("effect");
  return {
    getGithubRepoAccess: () =>
      Effect.succeed({
        token: "test-token",
        repo: { name: "owner/repo", id: 1, installationId: 2 },
      }),
  };
});

vi.mock("~/server/runtime", async () => {
  const { Effect, Layer, ManagedRuntime, Schema } = await import("effect");
  const { GitHubApi } = await import("./api");
  const { GitHubError } = await import("./schema");
  return {
    serverRuntime: ManagedRuntime.make(
      Layer.succeed(GitHubApi, {
        request: <T>(_token: string, path: string, schema: SchemaType.Decoder<T>, body?: object) =>
          Effect.gen(function* () {
            if (github.beforeRequest) {
              yield* Effect.promise(github.beforeRequest);
            }
            if (body) {
              github.patches++;
              if (github.failedClosures-- > 0) {
                return yield* new GitHubError({ message: "Temporarily unavailable" });
              }
              github.closed = true;
            }
            const issue = {
              id: 10,
              number: 3,
              title: "Issue",
              state: github.closed ? "closed" : "open",
              labels: [],
              assignees: [],
            };
            const page = github.pages
              ? path.endsWith("page=1")
                ? Array.from({ length: 100 }, (_, i) => ({ ...issue, id: 10 + i, number: 3 + i }))
                : [{ ...issue, id: 110, number: 103 }]
              : [issue];
            return yield* Schema.decodeUnknownEffect(schema)(
              path.includes("?") ? page : issue,
            ).pipe(Effect.mapError(() => new GitHubError({ message: "Unexpected test request" })));
          }),
      }),
    ),
  };
});

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((close) => close());
  github.failedClosures = 0;
  github.patches = 0;
  github.closed = false;
  github.pages = false;
  github.beforeRequest = undefined;
  vi.restoreAllMocks();
});

async function fixture() {
  const database = createTestDatabase();
  cleanups.push(database.close);
  await database.db.insert(user).values({ id: "user", name: "User", email: "user@example.com" });
  const connection = {
    id: "connection",
    userId: "user",
    laneId: "lane",
    installationId: 2,
    repositoryId: 1,
    repository: "owner/repo",
    onlyAssigned: false,
    labels: [],
  };
  await database.db.insert(githubConnection).values(connection);
  const data = new Map<string, unknown>([["billing:owner", "user"]]);
  const tasks = new Map<string, Task>();
  const storage = {
    get: async <T>(key: string) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Emulate structured-clone storage.
      return structuredClone(data.get(key)) as T | undefined;
    },
    put: async (entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) {
        data.set(key, structuredClone(value));
      }
    },
  };
  const broadcast = vi.fn(async () => {});
  const insert = vi.fn(async (batch: ReadonlyArray<Task>) => {
    for (const task of batch) {
      if (!tasks.has(task.id)) {
        tasks.set(task.id, task);
      }
    }
  });
  let tail = Promise.resolve();
  const serialized = <A>(work: () => Promise<A>) => {
    const result = tail.then(work);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  };
  const canWrite = vi.fn(async () => true);
  const restart = () =>
    new GitHubBoard({
      storage,
      database: database.DB,
      tasks: () => [...tasks.values()],
      laneExists: (id) => id === "lane",
      insert,
      broadcast,
      canWrite,
      serialized: (effect) =>
        fromGithubPromise(() => serialized(() => serverRuntime.runPromise(effect))),
    });
  return {
    data,
    tasks,
    storage,
    insert,
    broadcast,
    restart,
    serialized,
    canWrite,
    integration: restart(),
  };
}

describe("GitHub direct sync regressions", () => {
  it("retries an interrupted import without duplicates and remembers deleted issues after reconnect", async () => {
    const f = await fixture();
    vi.spyOn(f.storage, "put").mockRejectedValueOnce(new Error("Interrupted"));
    await expect(
      serverRuntime.runPromise(f.integration.importIssues("connection")),
    ).rejects.toThrow("GitHub is temporarily unavailable");
    expect(f.tasks.size).toBe(1);
    const restarted = f.restart();
    await serverRuntime.runPromise(restarted.importIssues("connection"));
    await serverRuntime.runPromise(restarted.importIssues("connection", 3));
    expect(f.tasks.size).toBe(1);
    f.tasks.clear();
    await f.serialized(() => serverRuntime.runPromise(restarted.disconnectLane("lane")));
    await serverRuntime.runPromise(
      restarted.saveSettings({
        laneId: "lane",
        installationId: 2,
        repositoryId: 1,
        labels: [],
        onlyAssigned: false,
      }),
    );
    expect(f.tasks.size).toBe(0);
    expect(f.data.get("github:issue:10")).toBe(true);
  });

  it("imports every page directly and broadcasts once per batch", async () => {
    const f = await fixture();
    github.pages = true;
    await serverRuntime.runPromise(f.integration.syncLane("lane"));
    expect(f.tasks.size).toBe(101);
    expect(f.insert).toHaveBeenCalledTimes(2);
    expect(f.broadcast).toHaveBeenCalledTimes(2);
    expect(new Set([...f.tasks.values()].map((task) => task.rank)).size).toBe(101);
  });

  it.each(["disconnect", "billing"])(
    "allows board writes during a GitHub fetch and rejects its result after %s changes",
    async (change) => {
      const f = await fixture();
      const started = Promise.withResolvers<void>();
      const pending = Promise.withResolvers<void>();
      github.beforeRequest = () => {
        started.resolve();
        return pending.promise;
      };
      const importing = serverRuntime.runPromise(f.integration.importIssues("connection"));
      await started.promise;
      try {
        await f.serialized(async () => {
          if (change === "disconnect") {
            await serverRuntime.runPromise(f.integration.disconnectLane("lane"));
          } else {
            f.canWrite.mockResolvedValue(false);
          }
        });
      } finally {
        pending.resolve();
      }
      if (change === "billing") {
        await expect(importing).rejects.toThrow("Update billing");
      } else {
        await importing;
      }
      expect(f.tasks.size).toBe(0);
    },
  );

  it("keeps local completion after a failed closure and only retries when explicitly called again", async () => {
    const f = await fixture();
    await serverRuntime.runPromise(f.integration.importIssues("connection"));
    const task = [...f.tasks.values()][0]!;
    f.tasks.set(task.id, { ...task, completed: true });
    github.failedClosures = 1;
    await serverRuntime.runPromise(f.integration.closeCompletedIssues([task.id]));
    expect(github.patches).toBe(1);
    expect(f.tasks.get(task.id)?.completed).toBe(true);
    await serverRuntime.runPromise(f.restart().closeCompletedIssues([task.id]));
    expect(github.patches).toBe(2);
    await serverRuntime.runPromise(f.restart().closeCompletedIssues([task.id]));
    expect(github.patches).toBe(2);
  });

  it("preserves the reason of an already closed issue and stops closures after disconnect", async () => {
    const f = await fixture();
    await serverRuntime.runPromise(f.integration.importIssues("connection"));
    const task = [...f.tasks.values()][0]!;
    f.tasks.set(task.id, { ...task, completed: true });
    github.closed = true;
    await serverRuntime.runPromise(f.integration.closeCompletedIssues([task.id]));
    expect(github.patches).toBe(0);
    await f.serialized(() => serverRuntime.runPromise(f.integration.disconnectLane("lane")));
    github.closed = false;
    await serverRuntime.runPromise(f.integration.closeCompletedIssues([task.id]));
    expect(github.patches).toBe(0);
  });
});
