import { createCloudflareDOSQLitePersistence } from "@tanstack/cloudflare-durable-objects-db-sqlite-persistence";
import { createTransaction } from "@tanstack/db";
import { Effect } from "effect";

import { decodeLane, decodeTask } from "~/board/sync/codec";
import {
  createLaneCollection,
  createTaskCollection,
  laneCollectionId,
  taskCollectionId,
} from "~/board/sync/collections";
import { Lane, Task } from "~/board/schema";
import {
  enforcedDescendantCompletions,
  isSystemLane,
  normalizeStoredBoard,
  normalizeTask,
  rehomeTasksForDeletedLane,
  tasksInLane,
} from "~/board/views";
import { SyncDurableObject } from "~/sync/durable-object";
import type { SyncSnapshot } from "~/sync/durable-object";
import { Mutation, SyncProtocolError } from "~/sync/protocol";

const optionalTaskKeys = [
  "laneId",
  "parentId",
  "date",
  "attachments",
] as const satisfies ReadonlyArray<keyof Task>;

type PreparedMutation =
  | { collection: typeof laneCollectionId; mutation: Mutation; value?: Lane }
  | { collection: typeof taskCollectionId; mutation: Mutation; value?: Task };

function replaceTask(draft: Task, next: Task) {
  for (const key of optionalTaskKeys) {
    if (next[key] === undefined) {
      delete draft[key];
    }
  }

  Object.assign(draft, next);
}

export class BoardObject extends SyncDurableObject<Env> {
  persistence = createCloudflareDOSQLitePersistence({
    storage: this.ctx.storage,
  });

  lanes = createLaneCollection(this.persistence);

  tasks = createTaskCollection(this.persistence);

  protected override async initializeSync() {
    await Promise.all([this.lanes.preload(), this.tasks.preload()]);
    await this.#persist(() => {
      normalizeStoredBoard({ lanes: this.lanes, tasks: this.tasks });
    });
  }

  protected override async readSyncSnapshot(): Promise<ReadonlyArray<SyncSnapshot>> {
    await Promise.all([this.lanes.preload(), this.tasks.preload()]);
    return [
      { collection: laneCollectionId, values: this.lanes.toArray },
      { collection: taskCollectionId, values: this.tasks.toArray },
    ];
  }

  protected override commitSyncMutations(
    mutations: ReadonlyArray<Mutation>,
  ): Promise<ReadonlyArray<Mutation>> {
    return Effect.runPromise(this.#commitMutations(mutations));
  }

  async #persist(mutate: () => void) {
    const transaction = createTransaction({
      autoCommit: false,
      mutationFn: async ({ transaction: pending }) => {
        await Promise.all([
          this.lanes.utils.acceptMutations(pending),
          this.tasks.utils.acceptMutations(pending),
        ]);
      },
    });
    transaction.mutate(mutate);
    await transaction.commit();
  }

  #commitMutations = Effect.fn("BoardObject.commitMutations")(function* (
    this: BoardObject,
    incoming: ReadonlyArray<Mutation>,
  ) {
    const prepared = yield* this.#prepareMutations(incoming);
    const applied = prepared.map(({ mutation }) => mutation);
    let outgoing: Mutation[] = [];
    yield* Effect.tryPromise({
      try: () =>
        this.#persist(() => {
          for (const mutation of prepared) {
            this.#applyMutation(mutation);
          }
          outgoing = [
            ...applied,
            ...this.#enforcedCompletionMutations(applied),
            ...this.#enforcedOrphanRehomeMutations(applied),
          ];
        }),
      catch: (cause) => new SyncProtocolError({ message: String(cause) }),
    });
    return outgoing;
  });

  #prepareMutations = Effect.fn("BoardObject.prepareMutations")(function* (
    this: BoardObject,
    mutations: ReadonlyArray<Mutation>,
  ) {
    const applied: PreparedMutation[] = [];
    for (const mutation of mutations) {
      applied.push(yield* this.#prepareMutation(mutation));
    }
    return applied;
  });

  #prepareMutation = Effect.fn("BoardObject.prepareMutation")(function* (
    this: BoardObject,
    mutation: Mutation,
  ) {
    if (mutation.collection === laneCollectionId) {
      if (mutation.type === "delete") {
        if (isSystemLane({ id: mutation.key })) {
          return yield* new SyncProtocolError({ message: "System lanes cannot be persisted" });
        }

        return { collection: laneCollectionId, mutation } satisfies PreparedMutation;
      }

      if (mutation.value === undefined) {
        // oxlint-disable-next-line typescript/consistent-return -- typed Effect failure
        return yield* new SyncProtocolError({ message: `Missing value for ${mutation.type}` });
      }

      const lane = yield* decodeLane(mutation.value);
      if (lane.id !== mutation.key) {
        return yield* new SyncProtocolError({
          message: "Lane mutation key does not match value",
        });
      }
      if (isSystemLane(lane)) {
        return yield* new SyncProtocolError({ message: "System lanes cannot be persisted" });
      }

      return {
        collection: laneCollectionId,
        mutation: new Mutation({
          collection: mutation.collection,
          type: mutation.type,
          key: mutation.key,
          value: lane,
        }),
        value: lane,
      } satisfies PreparedMutation;
    }

    if (mutation.collection !== taskCollectionId) {
      return yield* new SyncProtocolError({
        message: `Unknown board collection ${mutation.collection}`,
      });
    }

    if (mutation.type === "delete") {
      return { collection: taskCollectionId, mutation } satisfies PreparedMutation;
    }

    if (mutation.value === undefined) {
      // oxlint-disable-next-line typescript/consistent-return -- typed Effect failure
      return yield* new SyncProtocolError({ message: `Missing value for ${mutation.type}` });
    }

    const task = normalizeTask(yield* decodeTask(mutation.value));
    if (task.id !== mutation.key) {
      return yield* new SyncProtocolError({ message: "Task mutation key does not match value" });
    }
    return {
      collection: taskCollectionId,
      mutation: new Mutation({
        collection: mutation.collection,
        type: mutation.type,
        key: mutation.key,
        value: task,
      }),
      value: task,
    } satisfies PreparedMutation;
  });

  #applyMutation(prepared: PreparedMutation) {
    const { mutation } = prepared;
    if (prepared.collection === laneCollectionId) {
      if (mutation.type === "delete") {
        if (this.lanes.has(mutation.key)) {
          this.lanes.delete(mutation.key);
        }
        return;
      }

      const lane = prepared.value;
      if (lane === undefined) {
        throw new Error("Prepared lane mutation is missing its value");
      }
      if (this.lanes.has(mutation.key)) {
        this.lanes.update(mutation.key, (draft) => {
          Object.assign(draft, lane);
        });
      } else {
        this.lanes.insert(lane);
      }
      return;
    }

    if (mutation.type === "delete") {
      if (this.tasks.has(mutation.key)) {
        this.tasks.delete(mutation.key);
      }
      return;
    }

    const task = prepared.value;
    if (task === undefined) {
      throw new Error("Prepared task mutation is missing its value");
    }
    if (this.tasks.has(mutation.key)) {
      this.tasks.update(mutation.key, (draft) => {
        replaceTask(draft, task);
      });
    } else {
      this.tasks.insert(task);
    }
  }

  #enforcedCompletionMutations(incoming: ReadonlyArray<Mutation>): Mutation[] {
    const completedIds = incoming.flatMap((mutation) => {
      if (mutation.collection !== taskCollectionId || mutation.type === "delete") {
        return [];
      }

      const task = this.tasks.get(mutation.key);
      return task?.completed === true ? [mutation.key] : [];
    });

    return enforcedDescendantCompletions(this.tasks, completedIds).map(
      (task) =>
        new Mutation({
          collection: taskCollectionId,
          type: "update",
          key: task.id,
          value: task,
        }),
    );
  }

  #enforcedOrphanRehomeMutations(incoming: ReadonlyArray<Mutation>): Mutation[] {
    const deletedLaneIds = incoming.flatMap((mutation) =>
      mutation.collection === laneCollectionId && mutation.type === "delete" ? [mutation.key] : [],
    );
    const outgoing: Mutation[] = [];
    for (const laneId of deletedLaneIds) {
      const leftover = tasksInLane(this.tasks.toArray, laneId);
      if (leftover.length === 0) {
        continue;
      }

      rehomeTasksForDeletedLane(this.tasks, laneId);
      for (const task of leftover) {
        const next = this.tasks.get(task.id);
        if (next === undefined) {
          continue;
        }

        outgoing.push(
          new Mutation({
            collection: taskCollectionId,
            type: "update",
            key: next.id,
            value: next,
          }),
        );
      }
    }

    return outgoing;
  }
}

export function handleBoardRequest(request: Request, env: Env, id: string): Promise<Response> {
  return env.BOARD.get(env.BOARD.idFromName(id)).fetch(request);
}
