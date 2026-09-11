// Cloudflare host objects are represented by the controlled fixtures below.
// oxlint-disable typescript/no-unsafe-type-assertion
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { session, user } from "~/db/schema/auth";
import { createTestDatabase } from "~/db/test-database";
import { SyncDurableObject } from "~/sync/durable-object";
import { Mutation } from "~/sync/protocol";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      protected ctx: DurableObjectState,
      protected env: { DB: D1Database },
    ) {}
  },
}));
vi.mock("~/server/runtime", () => ({ serverRuntime: { runPromise: Effect.runPromise } }));

class Socket {
  sent: unknown[] = [];
  code: number | undefined;
  constructor(readonly attachment: unknown = { version: 3, userId: "a", sessionId: "one" }) {}
  deserializeAttachment() {
    return this.attachment;
  }
  send(raw: string) {
    if (this.code === undefined) {
      this.sent.push(JSON.parse(raw));
    }
  }
  close(code: number) {
    this.code = code;
  }
}

class Board extends SyncDurableObject<{ DB: D1Database }> {
  commits = 0;
  allowed = true;
  beforeCommit: (() => Promise<void>) | undefined;
  protected isSyncOwner(id: string) {
    return id === "a";
  }
  protected async initializeSync() {}
  protected async canMutate() {
    return this.allowed;
  }
  protected async readSyncSnapshot() {
    return [{ collection: "tasks", values: [] }];
  }
  protected async commitSyncMutations(mutations: ReadonlyArray<Mutation>) {
    await this.beforeCommit?.();
    this.commits++;
    return mutations;
  }
  snapshot() {
    return this.broadcastSyncSnapshot();
  }
  changes() {
    return Effect.runPromise(
      this.broadcastSyncMutations([
        new Mutation({ collection: "tasks", type: "insert", key: "task", value: { id: "task" } }),
      ]),
    );
  }
  receive(socket: Socket, tag = "Sync") {
    return this.webSocketMessage(
      socket as unknown as WebSocket,
      JSON.stringify({ _tag: tag, transactionId: "tx", mutations: [] }),
    );
  }
}

let database: ReturnType<typeof createTestDatabase>;

let sockets: Socket[];

let ctx: DurableObjectState;

let board: Board;

beforeEach(async () => {
  vi.stubGlobal("WebSocketRequestResponsePair", function WebSocketRequestResponsePair() {});
  database = createTestDatabase();
  await database.db.insert(user).values([
    { id: "a", name: "A", email: "a@example.test" },
    { id: "b", name: "B", email: "b@example.test" },
  ]);
  await database.db.insert(session).values(
    ["one", "two"].map((id) => ({
      id,
      token: id,
      userId: "a",
      expiresAt: new Date(Date.now() + 60_000),
      updatedAt: new Date(),
    })),
  );
  sockets = [new Socket(), new Socket({ version: 3, userId: "a", sessionId: "two" })];
  ctx = {
    id: { toString: () => "board-a" },
    waitUntil: () => {},
    getWebSockets: () => sockets,
    setWebSocketAutoResponse: () => {},
  } as unknown as DurableObjectState;
  board = new Board(ctx, { DB: database.DB });
});
afterEach(() => {
  database.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["Sync", "Mutate"])(
  "denies %s after revocation inside the operation queue",
  async (tag) => {
    await database.db.delete(session).where(eq(session.id, "one"));
    await board.receive(sockets[0]!, tag);
    expect(sockets[0]!.code).toBe(4401);
    expect(sockets[0]!.sent).toEqual([]);
    expect(board.commits).toBe(0);
    await board.receive(sockets[1]!, "Mutate");
    expect(board.commits).toBe(1);
  },
);

it.each(["snapshot", "changes"] as const)(
  "checks every session once per %s broadcast after hibernation",
  async (kind) => {
    sockets.push(
      new Socket(),
      new Socket(null),
      new Socket({ version: 1, userId: "a", sessionId: "two" }),
      new Socket({ version: 3, userId: "b", sessionId: "two" }),
    );
    await database.db.delete(session).where(eq(session.id, "one"));
    board = new Board(ctx, { DB: database.DB });
    const query = vi.spyOn(database.DB, "prepare");
    await board[kind]();
    expect(query).toHaveBeenCalledTimes(1);
    expect(sockets[1]!.sent).toHaveLength(1);
    for (const socket of sockets.filter((entry) => entry !== sockets[1])) {
      expect(socket.code).toBe(4401);
      expect(socket.sent).toEqual([]);
    }
  },
);

it("uses current expiry and account ownership without caching across operations", async () => {
  await board.receive(sockets[0]!);
  await database.db
    .update(session)
    .set({ expiresAt: new Date(Date.now() - 1) })
    .where(eq(session.id, "one"));
  await board.receive(sockets[0]!);
  expect(sockets[0]!.code).toBe(4401);
  await database.db
    .update(session)
    .set({ expiresAt: new Date(Date.now() + 60_000) })
    .where(eq(session.id, "one"));
  const renewed = new Socket();
  await board.receive(renewed);
  expect(renewed.sent).toHaveLength(1);
  await database.db.update(session).set({ userId: "b" }).where(eq(session.id, "one"));
  await board.receive(renewed, "Mutate");
  expect(renewed.code).toBe(4401);
  expect(board.commits).toBe(0);
});

it("sends authoritative changes before releasing the optimistic transaction", async () => {
  await board.receive(sockets[0]!, "Mutate");
  expect(sockets[0]!.sent).toEqual([
    expect.objectContaining({ _tag: "Changes" }),
    expect.objectContaining({ _tag: "Ack" }),
  ]);
});

it("rechecks acknowledgement delivery after an authorized operation finishes", async () => {
  board.beforeCommit = async () => {
    await database.db.delete(session).where(eq(session.id, "one"));
  };
  await board.receive(sockets[0]!, "Mutate");
  expect(board.commits).toBe(1);
  expect(sockets[0]!.sent).toEqual([]);
  expect(sockets[0]!.code).toBe(4401);
  expect(sockets[1]!.sent).toHaveLength(1);
});

it("denies operations and broadcasts on database failure with retryable closure", async () => {
  vi.spyOn(database.DB, "prepare").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  await board.receive(sockets[0]!, "Mutate");
  await board.snapshot();
  expect(board.commits).toBe(0);
  for (const socket of sockets) {
    expect(socket.code).toBe(1011);
    expect(socket.sent).toEqual([]);
  }
});

it("keeps authenticated reads when billing blocks writes", async () => {
  board.allowed = false;
  await board.receive(sockets[0]!, "Mutate");
  await board.receive(sockets[0]!);
  expect(sockets[0]!.sent).toEqual([
    expect.objectContaining({ _tag: "Reject", code: "billing_required" }),
    expect.objectContaining({ _tag: "Snapshot" }),
  ]);
});

it("checks queued operations after earlier work releases the queue", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = vi.fn();
  board.beforeCommit = () => {
    started();
    return gate;
  };
  const first = board.receive(sockets[1]!, "Mutate");
  await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
  const queued = board.receive(sockets[0]!, "Mutate");
  await database.db.delete(session).where(eq(session.id, "one"));
  release();
  await Promise.all([first, queued]);
  expect(board.commits).toBe(1);
  expect(sockets[0]!.code).toBe(4401);
  expect(sockets[0]!.sent).toEqual([]);
});

it("does not send protocol errors to sockets without session metadata", async () => {
  const socket = new Socket(null);
  await board.webSocketMessage(socket as unknown as WebSocket, "invalid JSON");
  expect(socket.code).toBe(4401);
  expect(socket.sent).toEqual([]);
});
