import { DurableObject } from "cloudflare:workers";
import { Effect } from "effect";

import {
  Ack,
  acknowledgedChanges,
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
import { serverRuntime } from "~/server/runtime";

export type SyncSnapshot = {
  collection: string;
  values: ReadonlyArray<unknown>;
};

function send(socket: WebSocket, message: unknown) {
  socket.send(JSON.stringify(message));
}

function mutationTelemetry(mutations: ReadonlyArray<Mutation>) {
  return {
    collections: [...new Set(mutations.map((mutation) => mutation.collection))]
      .toSorted()
      .join(","),
    mutationCount: mutations.length,
    mutationTypes: [...new Set(mutations.map((mutation) => mutation.type))].toSorted().join(","),
  };
}

function logServerSync(event: string, annotations: Record<string, string | number | boolean> = {}) {
  return Effect.logInfo("sync.lifecycle").pipe(
    Effect.annotateLogs({ component: "sync-server", event, ...annotations }),
  );
}

export abstract class SyncDurableObject<TEnv> extends DurableObject<TEnv> {
  #ready: Promise<void> | undefined;

  #queue: Promise<unknown> = Promise.resolve();

  protected async canMutate(): Promise<boolean> {
    return true;
  }

  protected async recoverPendingWork(): Promise<void> {}

  protected async serialized<T>(work: () => Promise<T>): Promise<T> {
    await this.#ensureReady();
    const pending = this.#queue.then(async () => {
      await this.recoverPendingWork();
      return work();
    });
    this.#queue = pending.catch(() => {});
    return pending;
  }

  protected async broadcastSyncSnapshot(): Promise<void> {
    const snapshot = await serverRuntime.runPromise(this.#snapshot());
    for (const socket of this.ctx.getWebSockets()) {
      try {
        send(socket, snapshot);
      } catch {
        socket.close(1011, "Snapshot delivery failed");
      }
    }
  }

  constructor(ctx: DurableObjectState, env: TEnv) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  protected abstract initializeSync(): Promise<void>;

  protected abstract readSyncSnapshot(): Promise<ReadonlyArray<SyncSnapshot>>;

  protected abstract commitSyncMutations(
    mutations: ReadonlyArray<Mutation>,
    transactionId: string,
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
      await this.serialized(() => serverRuntime.runPromise(this.#handleMessage(ws, parsed)));
    } catch (error) {
      const transactionId =
        typeof parsed === "object" &&
        parsed !== null &&
        "transactionId" in parsed &&
        typeof parsed.transactionId === "string"
          ? parsed.transactionId
          : "";
      await serverRuntime.runPromise(
        logServerSync("message_error", {
          outcome: "rejected",
          transactionId,
        }),
      );
      send(ws, new Reject({ transactionId, message: String(error) }));
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    // Reserved receive-only close codes cannot be sent back to the peer.
    ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, reason);
  }

  #ensureReady(): Promise<void> {
    this.#ready ??= this.initializeSync().catch((error: unknown) => {
      this.#ready = undefined;
      throw error;
    });
    return this.#ready;
  }

  #handleMessage = Effect.fn("SyncDurableObject.handleMessage")(function* (
    this: SyncDurableObject<TEnv>,
    ws: WebSocket,
    input: unknown,
  ) {
    const incoming = yield* decodeClientMessage(input);
    if (incoming instanceof Sync) {
      yield* Effect.annotateCurrentSpan({ messageType: "sync" });
      yield* logServerSync("sync_request", {
        socketCount: this.ctx.getWebSockets().length,
      });
      const snapshot = yield* this.#snapshot();
      send(ws, snapshot);
      yield* logServerSync("snapshot_sent", {
        collectionCount: snapshot.collections.length,
        rowCount: snapshot.collections.reduce((total, entry) => total + entry.values.length, 0),
      });
      return;
    }

    yield* Effect.annotateCurrentSpan({
      messageType: "mutate",
      transactionId: incoming.transactionId,
      ...mutationTelemetry(incoming.mutations),
    });
    yield* logServerSync("mutation_received", {
      transactionId: incoming.transactionId,
      ...mutationTelemetry(incoming.mutations),
    });
    yield* this.#applyMutate(ws, incoming);
  });

  #snapshot = Effect.fn("SyncDurableObject.snapshot")(function* (this: SyncDurableObject<TEnv>) {
    const startedAt = Date.now();
    const snapshot = yield* Effect.tryPromise({
      try: () => this.readSyncSnapshot(),
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });

    yield* logServerSync("snapshot_read", {
      collectionCount: snapshot.length,
      durationMs: Date.now() - startedAt,
      outcome: "success",
      rowCount: snapshot.reduce((total, entry) => total + entry.values.length, 0),
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
    yield* Effect.annotateCurrentSpan({
      transactionId: incoming.transactionId,
      ...mutationTelemetry(incoming.mutations),
    });
    const allowed = yield* Effect.tryPromise({
      try: () => this.canMutate(),
      catch: () => new SyncProtocolError({ message: "Access check unavailable" }),
    }).pipe(Effect.catch(() => Effect.void));
    if (allowed === undefined) {
      send(
        ws,
        new Reject({
          transactionId: incoming.transactionId,
          code: "temporarily_unavailable",
          message: "Access check unavailable. Your edits will retry.",
        }),
      );
      return;
    }
    if (!allowed) {
      send(
        ws,
        new Reject({
          transactionId: incoming.transactionId,
          code: "billing_required",
          message: "Subscription required. Your pending edits are preserved.",
        }),
      );
      return;
    }
    if (incoming.idempotencyKey !== undefined) {
      const appliedKey = `sync:applied:${incoming.idempotencyKey}`;
      const alreadyApplied = yield* Effect.tryPromise({
        try: () => this.ctx.storage.get<boolean>(appliedKey),
        catch: (cause) => new SyncProtocolError({ message: String(cause) }),
      });

      if (alreadyApplied === true) {
        send(ws, yield* this.#snapshot());
        send(ws, new Ack({ transactionId: incoming.transactionId }));
        yield* logServerSync("acknowledgement_sent", {
          outcome: "idempotent_replay",
          transactionId: incoming.transactionId,
        });
        return;
      }

      const mutations = yield* this.#commitMutations(incoming.mutations, incoming.transactionId);
      yield* Effect.tryPromise({
        try: () => this.ctx.storage.put(appliedKey, true),
        catch: (cause) => new SyncProtocolError({ message: String(cause) }),
      });
      yield* this.#broadcastMutations(ws, incoming.transactionId, mutations);
      return;
    }

    yield* this.#broadcastMutations(
      ws,
      incoming.transactionId,
      yield* this.#commitMutations(incoming.mutations, incoming.transactionId),
    );
  });

  #commitMutations = Effect.fn("SyncDurableObject.commitMutations")(function* (
    this: SyncDurableObject<TEnv>,
    mutations: ReadonlyArray<Mutation>,
    transactionId: string,
  ) {
    const startedAt = Date.now();
    const committed = yield* Effect.tryPromise({
      try: () => this.commitSyncMutations(mutations, transactionId),
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });
    yield* logServerSync("mutations_persisted", {
      durationMs: Date.now() - startedAt,
      outcome: "success",
      transactionId,
      ...mutationTelemetry(committed),
    });
    return committed;
  });

  protected broadcastSyncMutations(mutations: ReadonlyArray<Mutation>) {
    if (mutations.length === 0) {
      return Effect.void;
    }

    return this.#sendChanges(
      new Changes({
        changeId: crypto.randomUUID(),
        mutations,
      }),
    );
  }

  #broadcastMutations = Effect.fn("SyncDurableObject.broadcastMutations")(function* (
    this: SyncDurableObject<TEnv>,
    ws: WebSocket,
    transactionId: string,
    mutations: ReadonlyArray<Mutation>,
  ) {
    const [acknowledgement, changes] = acknowledgedChanges({
      changeId: crypto.randomUUID(),
      mutations,
      transactionId,
    });
    send(ws, acknowledgement);
    yield* logServerSync("acknowledgement_sent", {
      outcome: "success",
      transactionId,
    });
    yield* this.#sendChanges(changes);
  });

  #sendChanges = Effect.fn("SyncDurableObject.sendChanges")(function* (
    this: SyncDurableObject<TEnv>,
    changes: Changes,
  ) {
    const startedAt = Date.now();
    let sentSocketCount = 0;
    let failedSocketCount = 0;
    for (const socket of this.ctx.getWebSockets()) {
      const sent = yield* Effect.try({
        try: () => {
          send(socket, changes);
          return true;
        },
        catch: () => new SyncProtocolError({ message: "Failed to broadcast sync changes" }),
      }).pipe(Effect.catch(() => Effect.succeed(false)));
      if (sent) {
        sentSocketCount += 1;
      } else {
        failedSocketCount += 1;
        socket.close(1011, "Failed to broadcast sync changes");
      }
    }
    const annotations = {
      ...(changes.changeId === undefined ? {} : { changeId: changes.changeId }),
      durationMs: Date.now() - startedAt,
      failedSocketCount,
      outcome: failedSocketCount === 0 ? "success" : "partial_failure",
      sentSocketCount,
      socketCount: sentSocketCount + failedSocketCount,
      ...mutationTelemetry(changes.mutations),
      ...(changes.originatingTransactionId === undefined
        ? {}
        : { originatingTransactionId: changes.originatingTransactionId }),
    };
    yield* Effect.annotateCurrentSpan(annotations);
    yield* logServerSync("changes_broadcast", annotations);
  });
}
