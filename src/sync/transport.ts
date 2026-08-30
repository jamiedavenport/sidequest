import type { SyncConfig } from "@tanstack/db";
import { NonRetriableError } from "@tanstack/offline-transactions";
import { Effect, Exit } from "effect";

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
  resolve: () => void;
  reject: (error: Error) => void;
};

export type SyncTransportOptions = {
  url: string;
  collections: ReadonlyArray<string>;
  reconnectDelayMs?: number;
  transactionTimeoutMs?: number;
};

export class SyncTransport {
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
    if (socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket not connected"));
    }

    const transactionId = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(transactionId);
        reject(new Error(`Transaction ${transactionId} timed out`));
      }, this.#transactionTimeoutMs);

      this.#pending.set(transactionId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      try {
        socket.send(JSON.stringify(new Mutate({ transactionId, idempotencyKey, mutations })));
      } catch (error) {
        clearTimeout(timeout);
        this.#pending.delete(transactionId);
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

    this.#socket?.close();
    this.#socket = undefined;
    for (const pending of this.#pending.values()) {
      pending.reject(new Error("Sync closed"));
    }
    this.#pending.clear();
  }

  #connect() {
    if (this.#closed || this.#socket !== undefined) {
      return;
    }

    const socket = new WebSocket(this.#url);
    this.#socket = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(new Sync({})));
    });

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      const exit = Effect.runSync(Effect.exit(decodeServerMessage(parsed)));
      if (Exit.isFailure(exit)) {
        console.error("Failed to decode sync message", exit.cause);
        return;
      }

      this.#dispatchQueue = this.#dispatchQueue
        .then(() => this.#dispatch(exit.value))
        .catch((error: unknown) => {
          console.error("Failed to apply sync message", error);
          for (const pending of this.#pending.values()) {
            pending.reject(new Error("Failed to apply the authoritative sync state"));
          }
          this.#pending.clear();
          socket.close(1011, "Failed to apply sync message");
        });
    });

    socket.addEventListener("close", () => {
      this.#socket = undefined;
      this.#ready = false;
      this.#buffer = [];
      for (const pending of this.#pending.values()) {
        pending.reject(new Error("WebSocket disconnected before acknowledgment"));
      }
      this.#pending.clear();
      if (!this.#closed) {
        this.#reconnectTimer = setTimeout(() => {
          this.#reconnectTimer = undefined;
          this.#connect();
        }, this.#reconnectDelayMs);
      }
    });
  }

  async #dispatch(message: Snapshot | Changes | Ack | Reject) {
    if (message instanceof Snapshot) {
      await this.#applySnapshot(message);
      this.#ready = true;
      await this.#buffer.reduce(
        (previous, buffered) => previous.then(() => this.#applyChanges(buffered)),
        Promise.resolve(),
      );
      this.#buffer = [];
      return;
    }

    if (message instanceof Changes) {
      if (!this.#ready) {
        this.#buffer.push(message);
        return;
      }

      await this.#applyChanges(message);
      return;
    }

    if (message instanceof Ack) {
      const pending = this.#pending.get(message.transactionId);
      if (pending !== undefined) {
        this.#pending.delete(message.transactionId);
        pending.resolve();
      }
      return;
    }

    const pending = this.#pending.get(message.transactionId);
    if (pending !== undefined) {
      this.#pending.delete(message.transactionId);
      pending.reject(new NonRetriableError(message.message));
    }
  }

  async #applySnapshot(snapshot: Snapshot) {
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
      }),
    );
  }

  async #applyChanges(changes: Changes) {
    const byCollection = new Map<string, Mutation[]>();
    for (const mutation of changes.mutations) {
      this.assertCollection(mutation.collection);
      const list = byCollection.get(mutation.collection) ?? [];
      list.push(mutation);
      byCollection.set(mutation.collection, list);
    }

    await Promise.all(
      [...byCollection].map(async ([name, mutations]) => {
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
      }),
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
    });
  });
}
