import { reportBrowserEvent } from "~/telemetry/browser";
import {
  createTelemetryContext,
  parseTelemetryContext,
  type BrowserRecord,
  type TelemetryContext,
} from "~/telemetry/schema";
import { BillingRequiredError } from "~/billing/access";
import type { SyncConfig } from "@tanstack/db";
import { NonRetriableError } from "@tanstack/offline-transactions";
import { Effect, Exit, Schema } from "effect";

import {
  Ack,
  Changes,
  decodeServerMessage,
  Mutate,
  Mutation,
  Reject,
  Snapshot,
  Sync,
} from "~/sync/protocol";

type SyncApi<T extends object> = {
  begin: () => void;
  write: (
    message: { type: "insert" | "update"; value: T } | { type: "delete"; key: string },
  ) => void;
  commit: () => unknown;
  markReady: () => void;
  truncate: () => void;
};

type CollectionHandler = {
  begin: () => void;
  write: (type: "insert" | "update", value: unknown) => void;
  delete: (key: string) => void;
  commit: () => Promise<unknown>;
  markReady: () => void;
  truncate: () => void;
};

type PendingAcknowledgement = {
  resolve: (serverContext?: TelemetryContext) => void;
  reject: (error: Error) => void;
};

export class SessionValidationError extends Schema.TaggedError<SessionValidationError>()(
  "SessionValidationError",
  {},
) {}

export type SyncTransportOptions = {
  validateSession: () => Effect.Effect<boolean, SessionValidationError>;
  onAuthenticationLost: () => void;
  onBillingRequired?: () => void;
  url: string;
  collections: ReadonlyArray<string>;
  reconnectDelayMs?: number;
  transactionTimeoutMs?: number;
};

function mutationTelemetry(mutations: ReadonlyArray<Mutation>) {
  return {
    collections: [...new Set(mutations.map((mutation) => mutation.collection))]
      .toSorted()
      .join(","),
    mutationCount: mutations.length,
    mutationTypes: [...new Set(mutations.map((mutation) => mutation.type))].toSorted().join(","),
  };
}

function logClientSync(
  event: BrowserRecord["event"],
  details: Record<string, string | number | boolean> = {},
  telemetry?: TelemetryContext,
  link?: TelemetryContext,
) {
  reportBrowserEvent(event, { component: "sync-client", ...details }, telemetry, link);
}

export class SyncTransport {
  readonly #validateSession: SyncTransportOptions["validateSession"];
  readonly #onAuthenticationLost: () => void;
  #connecting = false;
  readonly #onBillingRequired: (() => void) | undefined;
  readonly #url: string;
  readonly #collections: ReadonlySet<string>;
  readonly #reconnectDelayMs: number;
  readonly #transactionTimeoutMs: number;
  readonly #handlers = new Map<string, CollectionHandler>();
  readonly #pending = new Map<string, PendingAcknowledgement>();
  #socket: WebSocket | undefined;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  #ready = false;
  #buffer: Changes[] = [];
  #dispatchQueue = Promise.resolve();

  constructor(options: SyncTransportOptions) {
    if (options.collections.length === 0) {
      throw new Error("Sync transport requires at least one collection");
    }

    this.#validateSession = options.validateSession;
    this.#onAuthenticationLost = options.onAuthenticationLost;
    this.#onBillingRequired = options.onBillingRequired;
    this.#url = options.url;
    this.#collections = new Set(options.collections);
    if (this.#collections.size !== options.collections.length) {
      throw new Error("Sync transport collection names must be unique");
    }

    this.#reconnectDelayMs = options.reconnectDelayMs ?? 1500;
    this.#transactionTimeoutMs = options.transactionTimeoutMs ?? 15_000;
  }

  subscribe<T extends object>(name: string, decode: (input: unknown) => T, params: SyncApi<T>) {
    if (!this.#collections.has(name)) {
      throw new Error(`Unknown sync collection ${name}`);
    }
    if (this.#handlers.has(name)) {
      throw new Error(`Sync collection ${name} is already subscribed`);
    }

    const handler: CollectionHandler = {
      begin: params.begin,
      write: (type, value) => {
        params.write({ type, value: decode(value) });
      },
      delete: (key) => {
        params.write({ type: "delete", key });
      },
      commit: () => Promise.resolve(params.commit()),
      markReady: params.markReady,
      truncate: params.truncate,
    };
    this.#handlers.set(name, handler);

    // A persistence wrapper may delay subscribing until its cached snapshot is hydrated.
    params.markReady();
    if ([...this.#collections].every((collection) => this.#handlers.has(collection))) {
      this.#connect();
    }

    return () => {
      if (this.#handlers.get(name) === handler) {
        this.#handlers.delete(name);
      }
      if (this.#handlers.size === 0) {
        this.close();
      }
    };
  }

  mutate(mutations: ReadonlyArray<Mutation>, idempotencyKey?: string): Promise<void> {
    for (const mutation of mutations) {
      this.assertCollection(mutation.collection);
    }

    const socket = this.#socket;
    if (this.#closed || socket?.readyState !== WebSocket.OPEN) {
      logClientSync("mutation_send_error", {
        outcome: "socket_not_connected",
        ...mutationTelemetry(mutations),
      });
      return Promise.reject(new Error("WebSocket not connected"));
    }

    const transactionId = crypto.randomUUID();
    const telemetry = createTelemetryContext();
    const startedAt = Date.now();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(transactionId);
        logClientSync(
          "acknowledgement_timeout",
          {
            durationMs: Date.now() - startedAt,
            outcome: "timeout",
            transactionId,
          },
          telemetry,
        );
        reject(new Error(`Transaction ${transactionId} timed out`));
      }, this.#transactionTimeoutMs);

      this.#pending.set(transactionId, {
        resolve: (serverContext) => {
          clearTimeout(timeout);
          logClientSync(
            "acknowledgement_applied",
            {
              durationMs: Date.now() - startedAt,
              outcome: "success",
              transactionId,
            },
            telemetry,
            serverContext,
          );
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          logClientSync(
            "acknowledgement_error",
            {
              durationMs: Date.now() - startedAt,
              outcome: "failure",
              transactionId,
            },
            telemetry,
          );
          reject(error);
        },
      });

      try {
        socket.send(
          JSON.stringify(
            new Mutate({
              transactionId,
              idempotencyKey,
              mutations,
              telemetry,
            }),
          ),
        );
        logClientSync("mutation_sent", {
          outcome: "success",
          transactionId,
          ...mutationTelemetry(mutations),
        });
      } catch (error) {
        clearTimeout(timeout);
        this.#pending.delete(transactionId);
        logClientSync("mutation_send_error", {
          outcome: "failure",
          transactionId,
          ...mutationTelemetry(mutations),
        });
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  assertCollection(name: string): string {
    if (!this.#collections.has(name)) {
      throw new Error(`Unknown sync collection ${name}`);
    }

    return name;
  }

  close() {
    this.#closed = true;
    if (this.#reconnectTimer !== undefined) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }

    const socket = this.#socket;
    this.#socket = undefined;
    this.#ready = false;
    this.#buffer = [];
    socket?.close();
    for (const pending of this.#pending.values()) {
      pending.reject(new Error("Sync closed"));
    }
    this.#pending.clear();
  }

  #loseAuthentication() {
    if (this.#closed) {
      return;
    }
    this.close();
    this.#onAuthenticationLost();
  }

  #scheduleReconnect() {
    if (this.#closed || this.#reconnectTimer !== undefined) {
      return;
    }
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      this.#connect();
    }, this.#reconnectDelayMs);
  }

  #connect() {
    if (this.#closed || this.#connecting || this.#socket !== undefined) {
      return;
    }
    this.#connecting = true;
    void Effect.runPromise(this.#openConnection()).finally(() => {
      this.#connecting = false;
    });
  }

  #openConnection = Effect.fn("SyncTransport.openConnection")(function* (this: SyncTransport) {
    const valid = yield* this.#validateSession().pipe(Effect.catch(() => Effect.void));
    if (this.#closed) {
      return;
    }
    if (valid === undefined) {
      this.#scheduleReconnect();
      return;
    }
    if (!valid) {
      this.#loseAuthentication();
      return;
    }
    const socket = yield* Effect.try({
      try: () => new WebSocket(this.#url),
      catch: () => new SessionValidationError(),
    }).pipe(Effect.catch(() => Effect.void));
    if (socket === undefined) {
      this.#scheduleReconnect();
      return;
    }
    this.#socket = socket;
    this.#listenToSocket(socket);
  });

  #listenToSocket(socket: WebSocket) {
    socket.addEventListener("open", () => {
      if (this.#closed || this.#socket !== socket) {
        return;
      }
      logClientSync("socket_open", { outcome: "success" });
      socket.send(JSON.stringify(new Sync({ telemetry: createTelemetryContext() })));
      logClientSync("sync_request_sent", { outcome: "success" });
    });

    socket.addEventListener("message", (event) => {
      if (this.#closed || this.#socket !== socket || typeof event.data !== "string") {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        logClientSync("message_decode_error", { outcome: "invalid_json" });
        return;
      }

      const exit = Effect.runSync(Effect.exit(decodeServerMessage(parsed)));

      if (Exit.isFailure(exit)) {
        logClientSync("message_decode_error", { outcome: "invalid_protocol" });
        return;
      }

      const message = exit.value;
      if (message instanceof Ack || message instanceof Reject) {
        this.#handleAcknowledgement(message);
        return;
      }

      if (message instanceof Changes) {
        logClientSync("changes_received", {
          ...(message.changeId === undefined ? {} : { changeId: message.changeId }),
          ...(message.originatingTransactionId === undefined
            ? {}
            : { originatingTransactionId: message.originatingTransactionId }),
          ...mutationTelemetry(message.mutations),
        });
      } else {
        logClientSync("snapshot_received", {
          collectionCount: message.collections.length,
          rowCount: message.collections.reduce((total, entry) => total + entry.values.length, 0),
        });
      }

      this.#dispatchQueue = this.#dispatchQueue
        .then(() => {
          return !this.#closed && this.#socket === socket
            ? this.#dispatchData(message, socket)
            : undefined;
        })
        .catch(() => {
          if (this.#closed || this.#socket !== socket) {
            return;
          }

          logClientSync("message_application_error", { outcome: "failure" });
          for (const pending of this.#pending.values()) {
            pending.reject(new Error("Failed to apply the authoritative sync state"));
          }
          this.#pending.clear();
          socket.close(1011, "Failed to apply sync message");
        });
    });

    socket.addEventListener("close", (event) => {
      if (this.#closed || this.#socket !== socket) {
        return;
      }
      this.#socket = undefined;
      this.#ready = false;
      this.#buffer = [];
      for (const pending of this.#pending.values()) {
        pending.reject(new Error("WebSocket disconnected before acknowledgment"));
      }
      this.#pending.clear();
      logClientSync("socket_close", {
        code: event.code,
        outcome: event.wasClean ? "clean" : "unclean",
      });
      if (event.code === 4401) {
        this.#loseAuthentication();
      } else {
        this.#scheduleReconnect();
      }
    });
  }

  #handleAcknowledgement(message: Ack | Reject) {
    const pending = this.#pending.get(message.transactionId);
    if (message instanceof Ack) {
      logClientSync("acknowledgement_received", {
        transactionId: message.transactionId,
      });
      if (pending !== undefined) {
        this.#pending.delete(message.transactionId);
        pending.resolve(parseTelemetryContext(message.telemetry));
      }
      return;
    }

    logClientSync("acknowledgement_rejected", {
      outcome: "rejected",
      transactionId: message.transactionId,
    });
    if (pending !== undefined) {
      this.#pending.delete(message.transactionId);
      if (message.code === "billing_required") {
        this.#onBillingRequired?.();
        pending.reject(new BillingRequiredError());
      } else if (message.code === "temporarily_unavailable") {
        pending.reject(new Error(message.message));
      } else {
        pending.reject(new NonRetriableError(message.message));
      }
    }
  }

  async #dispatchData(message: Snapshot | Changes, socket: WebSocket) {
    if (message instanceof Snapshot) {
      await this.#applySnapshot(message);
      if (this.#closed || this.#socket !== socket) {
        return;
      }
      this.#ready = true;
      await this.#buffer.reduce(
        (previous, buffered) =>
          previous.then(() => {
            return !this.#closed && this.#socket === socket
              ? this.#applyChanges(buffered)
              : undefined;
          }),
        Promise.resolve(),
      );
      this.#buffer = [];
      return;
    }

    if (!this.#ready) {
      this.#buffer.push(message);
      return;
    }

    await this.#applyChanges(message);
  }

  async #applySnapshot(snapshot: Snapshot) {
    const startedAt = Date.now();
    const values = new Map<string, ReadonlyArray<unknown>>();
    for (const entry of snapshot.collections) {
      this.assertCollection(entry.collection);
      if (values.has(entry.collection)) {
        throw new Error(`Duplicate snapshot for sync collection ${entry.collection}`);
      }
      values.set(entry.collection, entry.values);
    }
    for (const name of this.#collections) {
      if (!values.has(name)) {
        throw new Error(`Snapshot is missing sync collection ${name}`);
      }
    }

    await Promise.all(
      [...this.#collections].map(async (name) => {
        const collectionStartedAt = Date.now();
        const params = this.#handlers.get(name);
        if (params === undefined) {
          throw new Error(`Missing sync handler for ${name}`);
        }

        params.begin();
        params.truncate();
        for (const value of values.get(name) ?? []) {
          params.write("insert", value);
        }
        await params.commit();
        params.markReady();
        logClientSync("collection_commit", {
          collection: name,
          durationMs: Date.now() - collectionStartedAt,
          mutationCount: values.get(name)?.length ?? 0,
          outcome: "success",
          source: "snapshot",
        });
      }),
    );
    logClientSync(
      "snapshot_applied",
      {
        collectionCount: snapshot.collections.length,
        durationMs: Date.now() - startedAt,
        outcome: "success",
        rowCount: snapshot.collections.reduce((total, entry) => total + entry.values.length, 0),
      },
      createTelemetryContext(),
      parseTelemetryContext(snapshot.telemetry),
    );
  }

  async #applyChanges(changes: Changes) {
    const startedAt = Date.now();
    const byCollection = new Map<string, Mutation[]>();
    for (const mutation of changes.mutations) {
      this.assertCollection(mutation.collection);
      const list = byCollection.get(mutation.collection) ?? [];
      list.push(mutation);
      byCollection.set(mutation.collection, list);
    }

    await Promise.all(
      [...byCollection].map(async ([name, mutations]) => {
        const collectionStartedAt = Date.now();
        const params = this.#handlers.get(name);
        if (params === undefined) {
          throw new Error(`Missing sync handler for ${name}`);
        }

        params.begin();
        for (const mutation of mutations) {
          if (mutation.type === "delete") {
            params.delete(mutation.key);
          } else if (mutation.value !== undefined) {
            params.write(mutation.type, mutation.value);
          }
        }
        await params.commit();
        logClientSync("collection_commit", {
          ...(changes.changeId === undefined ? {} : { changeId: changes.changeId }),
          collection: name,
          durationMs: Date.now() - collectionStartedAt,
          mutationCount: mutations.length,
          mutationTypes: [...new Set(mutations.map((mutation) => mutation.type))]
            .toSorted()
            .join(","),
          outcome: "success",
          source: "changes",
        });
      }),
    );
    logClientSync(
      "changes_applied",
      {
        ...(changes.changeId === undefined ? {} : { changeId: changes.changeId }),
        durationMs: Date.now() - startedAt,
        outcome: "success",
        ...(changes.originatingTransactionId === undefined
          ? {}
          : { originatingTransactionId: changes.originatingTransactionId }),
        ...mutationTelemetry(changes.mutations),
      },
      createTelemetryContext(),
      parseTelemetryContext(changes.telemetry),
    );
  }
}

export function collectionSync<T extends object>(
  transport: SyncTransport,
  name: string,
  decode: (input: unknown) => T,
): SyncConfig<T, string> {
  return {
    rowUpdateMode: "full",
    sync: (params) =>
      transport.subscribe(name, decode, {
        begin: params.begin,
        write: (message) => {
          // The generic transport erases the collection type between the protocol and this callback.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          params.write(message as Parameters<typeof params.write>[0]);
        },
        commit: params.commit,
        markReady: params.markReady,
        truncate: params.truncate,
      }),
  };
}

export type PendingMutationTransaction = {
  mutations: ReadonlyArray<{
    type: string;
    collection: { id: string };
    key: string | number;
    modified: unknown;
    original: unknown;
  }>;
};

export function transactionMutations(
  transport: SyncTransport,
  transaction: PendingMutationTransaction,
): Mutation[] {
  return transaction.mutations.map((mutation) => {
    const collection = transport.assertCollection(mutation.collection.id);
    if (mutation.type === "delete") {
      return new Mutation({
        collection,
        type: "delete",
        key: String(mutation.key),
        value: mutation.original,
      });
    }

    return new Mutation({
      collection,
      type: mutation.type === "update" ? "update" : "insert",
      key: String(mutation.key),
      value: mutation.modified,
      ...(collection === "tasks" && mutation.type === "update"
        ? {
            originalAttachmentIds: getAttachmentIds(mutation.original),
          }
        : {}),
    });
  });
}

function getAttachmentIds(value: unknown): string[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("attachments" in value) ||
    !Array.isArray(value.attachments)
  ) {
    return [];
  }
  return value.attachments.flatMap((item: unknown) =>
    typeof item === "object" && item !== null && "id" in item && typeof item.id === "string"
      ? [item.id]
      : [],
  );
}
