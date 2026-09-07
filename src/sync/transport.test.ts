import { BillingRequiredError } from "~/billing/access";
import { NonRetriableError } from "@tanstack/offline-transactions";
import { Effect, Exit } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Ack,
  Changes,
  CollectionSnapshot,
  decodeClientMessage,
  Mutation,
  Mutate,
  Reject,
  Snapshot,
} from "~/sync/protocol";
import { SessionValidationError, SyncTransport, type SyncTransportOptions } from "~/sync/transport";

type SocketListener = (event: unknown) => void;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly sent: string[] = [];
  readonly #listeners = new Map<string, SocketListener[]>();
  readyState = MockWebSocket.CONNECTING;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000) {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSED;
    this.#emit("close", { code, wasClean: code === 1000 });
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.#emit("open", {});
  }

  receive(message: Ack | Changes | Reject | Snapshot) {
    this.#emit("message", { data: JSON.stringify(message) });
  }

  #emit(type: string, event: unknown) {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function sentMutation(socket: MockWebSocket) {
  for (const entry of socket.sent) {
    const parsed: unknown = JSON.parse(entry);
    const exit = Effect.runSync(Effect.exit(decodeClientMessage(parsed)));
    if (Exit.isSuccess(exit) && exit.value instanceof Mutate) {
      return exit.value.transactionId;
    }
  }
  throw new Error("Expected a sent mutation");
}

function decodeTask(input: unknown): { id: string } {
  if (
    typeof input !== "object" ||
    input === null ||
    !("id" in input) ||
    typeof input.id !== "string"
  ) {
    throw new Error("Expected a task");
  }
  return { id: input.id };
}

async function connectedTransport(
  commit: () => Promise<unknown>,
  options: Partial<SyncTransportOptions> = {},
) {
  let readyCount = 0;
  const writes: unknown[] = [];
  const transport = new SyncTransport({
    url: "ws://sidequest.test/api/board",
    collections: ["tasks"],
    transactionTimeoutMs: 1_000,
    validateSession: () => Effect.succeed(true),
    onAuthenticationLost: vi.fn(),
    ...options,
  });

  transport.subscribe("tasks", decodeTask, {
    begin: vi.fn(),
    write: (message) => writes.push(message),
    commit,
    markReady: () => {
      readyCount += 1;
    },
    truncate: vi.fn(),
  });

  await vi.waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(0));
  const socket = MockWebSocket.instances.at(-1);
  if (socket === undefined) {
    throw new Error("Expected the transport to create a WebSocket");
  }

  socket.open();
  socket.receive(
    new Snapshot({
      collections: [new CollectionSnapshot({ collection: "tasks", values: [] })],
    }),
  );
  await vi.waitFor(() => expect(readyCount).toBe(2));

  return { socket, transport, writes };
}

function insertTask(id: string) {
  return new Mutation({
    collection: "tasks",
    type: "insert",
    key: id,
    value: { id },
  });
}

describe("SyncTransport acknowledgements", () => {
  it("returns a resumable billing rejection instead of rolling back durable edits", async () => {
    const { transport, socket } = await connectedTransport(async () => {});
    const result = transport.mutate([insertTask("pending")], "same-key");
    socket.receive(
      new Reject({
        transactionId: sentMutation(socket),
        code: "billing_required",
        message: "Payment needed",
      }),
    );
    await expect(result).rejects.toBeInstanceOf(BillingRequiredError);
    const resumed = transport.mutate([insertTask("pending")], "same-key");
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const sent = JSON.parse(socket.sent.at(-1)!) as {
      transactionId: string;
      idempotencyKey: string;
    };
    expect(sent.idempotencyKey).toBe("same-key");
    socket.receive(new Ack({ transactionId: sent.transactionId }));
    await expect(resumed).resolves.toBeUndefined();
    transport.close();
  });

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("settles a mutation acknowledgement while authoritative changes are still committing", async () => {
    const blockedCommit = deferred();
    let blockChanges = false;
    const { socket, transport, writes } = await connectedTransport(() =>
      blockChanges ? blockedCommit.promise : Promise.resolve(),
    );

    blockChanges = true;
    socket.receive(
      new Changes({
        changeId: "remote-change",
        mutations: [insertTask("remote-task")],
      }),
    );
    await vi.waitFor(() => expect(writes).toHaveLength(1));

    const mutation = transport.mutate([insertTask("local-task")], "local-idempotency-key");
    socket.receive(new Ack({ transactionId: sentMutation(socket) }));

    await expect(mutation).resolves.toBeUndefined();
    expect(writes).toEqual([{ type: "insert", value: { id: "remote-task" } }]);

    blockedCommit.resolve();
    transport.close();
  });

  it("settles a rejection while authoritative changes are still committing", async () => {
    const blockedCommit = deferred();
    let blockChanges = false;
    const { socket, transport, writes } = await connectedTransport(() =>
      blockChanges ? blockedCommit.promise : Promise.resolve(),
    );

    blockChanges = true;
    socket.receive(
      new Changes({
        changeId: "remote-change",
        mutations: [insertTask("remote-task")],
      }),
    );
    await vi.waitFor(() => expect(writes).toHaveLength(1));

    const mutation = transport.mutate([insertTask("local-task")], "local-idempotency-key");
    socket.receive(
      new Reject({ transactionId: sentMutation(socket), message: "Mutation was rejected" }),
    );

    await expect(mutation).rejects.toBeInstanceOf(NonRetriableError);

    blockedCommit.resolve();
    transport.close();
  });

  it("continues to apply authoritative changes in arrival order", async () => {
    const firstCommit = deferred();
    let commitCount = 0;
    const { socket, transport, writes } = await connectedTransport(() => {
      commitCount += 1;
      return commitCount === 2 ? firstCommit.promise : Promise.resolve();
    });

    socket.receive(new Changes({ changeId: "change-1", mutations: [insertTask("task-1")] }));
    socket.receive(new Changes({ changeId: "change-2", mutations: [insertTask("task-2")] }));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ type: "insert", value: { id: "task-1" } });

    firstCommit.resolve();
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toEqual({ type: "insert", value: { id: "task-2" } });

    transport.close();
  });
});

describe("session recovery", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stops reconnecting after authentication loss and rejects pending edits as retryable", async () => {
    const onAuthenticationLost = vi.fn();
    const { transport, socket } = await connectedTransport(async () => {}, {
      onAuthenticationLost,
    });
    const pending = transport.mutate([insertTask("saved")]);
    const rejected = expect(pending).rejects.not.toBeInstanceOf(NonRetriableError);
    vi.useFakeTimers();
    socket.close(4401);
    await rejected;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onAuthenticationLost).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(1);
    transport.close();
  });

  it("rechecks identity on reconnect and keeps network failures retryable", async () => {
    const validateSession = vi
      .fn<SyncTransportOptions["validateSession"]>()
      .mockReturnValueOnce(Effect.succeed(true))
      .mockReturnValueOnce(Effect.fail(new SessionValidationError()))
      .mockReturnValueOnce(Effect.succeed(true))
      .mockReturnValue(Effect.succeed(false));
    const onAuthenticationLost = vi.fn();
    const { transport, socket, writes } = await connectedTransport(async () => {}, {
      validateSession,
      onAuthenticationLost,
    });
    vi.useFakeTimers();
    socket.close(1011);
    await vi.advanceTimersByTimeAsync(1500);
    expect(onAuthenticationLost).not.toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(MockWebSocket.instances).toHaveLength(2);
    // Late callbacks from the previous connection cannot reset or populate this client.
    socket.open();
    socket.receive(new Changes({ mutations: [insertTask("stale")] }));
    socket.close();
    expect(writes).toEqual([]);
    MockWebSocket.instances[1]!.close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onAuthenticationLost).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(2);
    transport.close();
  });

  it("ignores session validation completing after disposal", async () => {
    const gate = deferred();
    const onAuthenticationLost = vi.fn();
    const transport = new SyncTransport({
      url: "ws://sidequest.test",
      collections: ["tasks"],
      onAuthenticationLost,
      validateSession: () => Effect.promise(() => gate.promise).pipe(Effect.as(true)),
    });
    transport.subscribe("tasks", decodeTask, {
      begin: vi.fn(),
      write: vi.fn(),
      commit: vi.fn(),
      markReady: vi.fn(),
      truncate: vi.fn(),
    });
    transport.close();
    gate.resolve();
    await gate.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(MockWebSocket.instances).toEqual([]);
    expect(onAuthenticationLost).not.toHaveBeenCalled();
  });
});
