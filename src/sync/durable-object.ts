import { syncProtocolVersion } from "~/sync/protocol";
import {
  annotateOperation,
  captureTelemetryContext,
  observeInvocation,
  requestTelemetryContext,
} from "~/telemetry/runtime";
import { parseTelemetryContext } from "~/telemetry/schema";
import { DurableObject } from "cloudflare:workers";
import { Effect, Schema } from "effect";

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
import { getValidSessions, SocketSession } from "~/sync/session";
import { serverRuntime } from "~/server/runtime";

export type SyncSnapshot = {
  collection: string;
  values: ReadonlyArray<unknown>;
};

type SocketAcknowledgement = { socket: WebSocket; message: Ack };

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

export abstract class SyncDurableObject<
  TEnv extends { DB: D1Database } & import("~/telemetry/runtime").TelemetryBindings,
> extends DurableObject<TEnv> {
  #ready: Promise<void> | undefined;

  #queue: Promise<unknown> = Promise.resolve();

  protected async canMutate(): Promise<boolean> {
    return true;
  }

  protected async recoverPendingWork(): Promise<void> {}

  protected async serialized<T>(work: () => Promise<T>): Promise<T> {
    const queuedAt = Date.now();
    await this.#ensureReady();
    const pending = this.#queue.then(async () => {
      annotateOperation({ queueWaitMs: Date.now() - queuedAt });
      await this.recoverPendingWork();
      return work();
    });
    this.#queue = pending.catch(() => {});
    return pending;
  }

  protected async broadcastSyncSnapshot(): Promise<void> {
    const snapshot = await serverRuntime.runPromise(this.#snapshot());
    await serverRuntime.runPromise(this.#sendMessage(this.ctx.getWebSockets(), snapshot));
  }

  protected abstract isSyncOwner(userId: string): boolean;

  #authorizeSockets = Effect.fn("SyncDurableObject.authorizeSockets")(function* (
    this: SyncDurableObject<TEnv>,
    sockets: ReadonlyArray<WebSocket>,
  ) {
    const attached = yield* Effect.forEach(sockets, (socket) =>
      Effect.try({
        try: () => Schema.decodeUnknownSync(SocketSession)(socket.deserializeAttachment()),
        catch: () => new SyncProtocolError({ message: "Invalid socket session" }),
      }).pipe(
        Effect.filterOrFail(
          (identity) => this.isSyncOwner(identity.userId),
          () => new SyncProtocolError({ message: "Board account mismatch" }),
        ),
        Effect.map((identity) => ({ socket, identity })),
        Effect.catch(() =>
          Effect.gen(function* () {
            socket.close(4401, "Authentication required");
            yield* logServerSync("authorization_failed", { outcome: "invalid_attachment" });
            return undefined;
          }),
        ),
      ),
    );
    const connections = attached.filter((entry) => entry !== undefined);
    const owner = connections[0]?.identity.userId;
    if (owner) {
      annotateOperation({ accountId: owner, boardId: this.ctx.id.toString() });
    }
    if (owner === undefined) {
      return [];
    }
    const valid = yield* getValidSessions(
      this.env.DB,
      owner,
      connections.map(({ identity }) => identity.sessionId),
    ).pipe(
      Effect.catch(() =>
        Effect.gen(function* () {
          yield* logServerSync("authorization_failed", { outcome: "check_unavailable" });
          return undefined;
        }),
      ),
    );
    return yield* Effect.filter(connections, ({ socket, identity }) =>
      Effect.gen(function* () {
        if (valid?.has(identity.sessionId)) {
          return true;
        }
        socket.close(
          valid === undefined ? 1011 : 4401,
          valid === undefined ? "Session check unavailable" : "Authentication required",
        );
        if (valid !== undefined) {
          yield* logServerSync("authorization_failed", { outcome: "invalid_session" });
        }
        return false;
      }),
    ).pipe(Effect.map((entries) => entries.map(({ socket }) => socket)));
  });

  #sendMessage = Effect.fn("SyncDurableObject.sendMessage")(function* (
    this: SyncDurableObject<TEnv>,
    sockets: ReadonlyArray<WebSocket>,
    message: Ack | Changes | Snapshot | Reject,
    acknowledgement?: SocketAcknowledgement,
  ) {
    const authorized = yield* this.#authorizeSockets(sockets);
    const sent = yield* Effect.forEach(authorized, (socket) =>
      Effect.try({
        try: () => {
          // Keep the origin's acknowledgement and changes together after one fresh batch check.
          if (acknowledgement?.socket === socket) {
            socket.send(
              JSON.stringify(
                new Ack({
                  transactionId: acknowledgement.message.transactionId,
                  telemetry: captureTelemetryContext(),
                }),
              ),
            );
          }
          socket.send(
            JSON.stringify(
              Object.assign(Object.create(null), message, { telemetry: captureTelemetryContext() }),
            ),
          );
          return true;
        },
        catch: () => new SyncProtocolError({ message: "Sync delivery failed" }),
      }).pipe(
        Effect.tap(() =>
          acknowledgement?.socket === socket
            ? logServerSync("acknowledgement_sent", {
                outcome: "success",
                transactionId: acknowledgement.message.transactionId,
              })
            : Effect.void,
        ),
        Effect.catch(() =>
          Effect.sync(() => {
            socket.close(1011, "Sync delivery failed");
            return false;
          }),
        ),
      ),
    );
    return sent.filter(Boolean).length;
  });

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
    return observeInvocation(
      this.env,
      (promise) => this.ctx.waitUntil(promise),
      "sync.upgrade",
      () => this.#fetch(request),
      requestTelemetryContext(request),
      { component: "sync-server", category: "domain" },
    );
  }

  async #fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return new Response("Expected GET", { status: 405 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const identity = Schema.decodeUnknownOption(SocketSession)({
      version: syncProtocolVersion,
      userId: request.headers.get("x-sidequest-user-id"),
      sessionId: request.headers.get("x-sidequest-session-id"),
    });
    if (identity._tag === "None" || !this.isSyncOwner(identity.value.userId)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const sockets = new WebSocketPair();
    sockets[1].serializeAttachment(identity.value);
    this.ctx.acceptWebSocket(sockets[1]);
    return new Response(null, { status: 101, webSocket: sockets[0] });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let context;
    try {
      const input = JSON.parse(
        typeof message === "string" ? message : new TextDecoder().decode(message),
      );
      context = parseTelemetryContext(input?.telemetry);
    } catch {
      /* Protocol validation remains in the handler. */
    }
    return observeInvocation(
      this.env,
      (promise) => this.ctx.waitUntil(promise),
      "sync.message",
      () => this.#receiveMessage(ws, message),
      context,
      { component: "sync-server", category: "domain", protocolVersion: syncProtocolVersion },
    );
  }

  async #receiveMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.#ensureReady();
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      await serverRuntime.runPromise(
        this.#sendMessage([ws], new Reject({ transactionId: "", message: "Invalid JSON" })),
      );
      return;
    }

    try {
      await this.serialized(() => serverRuntime.runPromise(this.#handleMessage(ws, parsed)));
    } catch {
      annotateOperation({ outcome: "unexpected_failure" });
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
      await serverRuntime.runPromise(
        this.#sendMessage(
          [ws],
          new Reject({ transactionId, message: "Sync operation failed. Please retry." }),
        ),
      );
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    // Reserved receive-only close codes cannot be sent back to the peer.
    ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, reason);
  }

  #ensureReady(): Promise<void> {
    this.#ready ??= this.initializeSync().catch((error: unknown) => {
      annotateOperation({ outcome: "unexpected_failure", failureStage: "initialization" });
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
    if ((yield* this.#authorizeSockets([ws])).length === 0) {
      return;
    }
    const incoming = yield* decodeClientMessage(input);
    if (incoming instanceof Sync) {
      yield* Effect.annotateCurrentSpan({ messageType: "sync" });
      yield* logServerSync("sync_request", {
        socketCount: this.ctx.getWebSockets().length,
      });
      const snapshot = yield* this.#snapshot();
      yield* this.#sendMessage([ws], snapshot);
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
      snapshotBytes: new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
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
      annotateOperation({ outcome: "unexpected_failure", failureStage: "authorization" });
      yield* this.#sendMessage(
        [ws],
        new Reject({
          transactionId: incoming.transactionId,
          code: "temporarily_unavailable",
          message: "Access check unavailable. Your edits will retry.",
        }),
      );
      return;
    }
    if (!allowed) {
      annotateOperation({ outcome: "expected_rejection", failureStage: "billing" });
      yield* this.#sendMessage(
        [ws],
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
        yield* this.#sendMessage([ws], yield* this.#snapshot());
        yield* this.#sendMessage([ws], new Ack({ transactionId: incoming.transactionId }));
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
    yield* this.#sendChanges(changes, { socket: ws, message: acknowledgement });
  });

  #sendChanges = Effect.fn("SyncDurableObject.sendChanges")(function* (
    this: SyncDurableObject<TEnv>,
    changes: Changes,
    acknowledgement?: SocketAcknowledgement,
  ) {
    const startedAt = Date.now();
    const sockets = this.ctx.getWebSockets();
    const sentSocketCount = yield* this.#sendMessage(sockets, changes, acknowledgement);
    const failedSocketCount = sockets.length - sentSocketCount;
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
