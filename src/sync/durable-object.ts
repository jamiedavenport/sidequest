import { DurableObject } from "cloudflare:workers";
import { Effect } from "effect";

import {
  Ack,
  Changes,
  CollectionSnapshot,
  decodeClientMessage,
  Mutate,
  Mutation,
  Reject,
  Snapshot,
  Sync,
  SyncProtocolError,
} from "~/sync/protocol";

export type SyncSnapshot = {
  collection: string;
  values: ReadonlyArray<unknown>;
};

function send(socket: WebSocket, message: unknown) {
  socket.send(JSON.stringify(message));
}

export abstract class SyncDurableObject<TEnv> extends DurableObject<TEnv> {
  #ready: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: TEnv) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  protected abstract initializeSync(): Promise<void>;

  protected abstract readSyncSnapshot(): Promise<ReadonlyArray<SyncSnapshot>>;

  protected abstract commitSyncMutations(
    mutations: ReadonlyArray<Mutation>,
  ): Promise<ReadonlyArray<Mutation>>;

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return new Response("Expected GET", { status: 405 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const sockets = new WebSocketPair();
    this.ctx.acceptWebSocket(sockets[1]);
    return new Response(null, { status: 101, webSocket: sockets[0] });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.#ensureReady();
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      send(ws, new Reject({ transactionId: "", message: "Invalid JSON" }));
      return;
    }

    try {
      await Effect.runPromise(this.#handleMessage(ws, parsed));
    } catch (error) {
      const transactionId =
        typeof parsed === "object" &&
        parsed !== null &&
        "transactionId" in parsed &&
        typeof parsed.transactionId === "string"
          ? parsed.transactionId
          : "";
      send(ws, new Reject({ transactionId, message: String(error) }));
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }

  #ensureReady(): Promise<void> {
    this.#ready ??= this.initializeSync();
    return this.#ready;
  }

  #handleMessage = Effect.fn("SyncDurableObject.handleMessage")(function* (
    this: SyncDurableObject<TEnv>,
    ws: WebSocket,
    input: unknown,
  ) {
    const incoming = yield* decodeClientMessage(input);
    if (incoming instanceof Sync) {
      send(ws, yield* this.#snapshot());
      return;
    }

    yield* this.#applyMutate(ws, incoming);
  });

  #snapshot = Effect.fn("SyncDurableObject.snapshot")(function* (this: SyncDurableObject<TEnv>) {
    const snapshot = yield* Effect.tryPromise({
      try: () => this.readSyncSnapshot(),
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });

    return new Snapshot({
      collections: snapshot.map(
        ({ collection, values }) => new CollectionSnapshot({ collection, values: [...values] }),
      ),
    });
  });

  #applyMutate = Effect.fn("SyncDurableObject.applyMutate")(function* (
    this: SyncDurableObject<TEnv>,
    ws: WebSocket,
    incoming: Mutate,
  ) {
    if (incoming.idempotencyKey !== undefined) {
      const appliedKey = `sync:applied:${incoming.idempotencyKey}`;
      const alreadyApplied = yield* Effect.tryPromise({
        try: () => this.ctx.storage.get<boolean>(appliedKey),
        catch: (cause) => new SyncProtocolError({ message: String(cause) }),
      });

      if (alreadyApplied === true) {
        send(ws, yield* this.#snapshot());
        send(ws, new Ack({ transactionId: incoming.transactionId }));
        return;
      }

      const mutations = yield* this.#commitMutations(incoming.mutations);
      yield* Effect.tryPromise({
        try: () => this.ctx.storage.put(appliedKey, true),
        catch: (cause) => new SyncProtocolError({ message: String(cause) }),
      });
      this.#broadcastMutations(ws, incoming.transactionId, mutations);
      return;
    }

    this.#broadcastMutations(
      ws,
      incoming.transactionId,
      yield* this.#commitMutations(incoming.mutations),
    );
  });

  #commitMutations = Effect.fn("SyncDurableObject.commitMutations")(function* (
    this: SyncDurableObject<TEnv>,
    mutations: ReadonlyArray<Mutation>,
  ) {
    return yield* Effect.tryPromise({
      try: () => this.commitSyncMutations(mutations),
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });
  });

  #broadcastMutations(ws: WebSocket, transactionId: string, mutations: ReadonlyArray<Mutation>) {
    const changes = new Changes({ mutations });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        send(socket, changes);
      } catch {
        socket.close(1011, "Failed to broadcast sync changes");
      }
    }

    send(ws, new Ack({ transactionId }));
  }
}
