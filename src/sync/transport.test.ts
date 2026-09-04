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
import { SyncTransport } from "~/sync/transport";

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

async function connectedTransport(commit: () => Promise<unknown>) {
  let readyCount = 0;
  const writes: unknown[] = [];
  const transport = new SyncTransport({
    url: "ws://sidequest.test/api/board",
    collections: ["tasks"],
    transactionTimeoutMs: 1_000,
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
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
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
