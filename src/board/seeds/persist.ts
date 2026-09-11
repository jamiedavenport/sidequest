import { Effect } from "effect";

import { systemLanes } from "~/board/views";
import type { Lane, Note, Task, Whiteboard } from "~/board/schema";
import { BoardSeedError, validateBoardSeed } from "~/board/seeds/schema";

type SeedCollection<T> = {
  readonly size: number;
  insert: (values: T[]) => { isPersisted: { promise: Promise<unknown> } };
};

type SeedCollections = {
  lanes: SeedCollection<Lane> & { has: (id: string) => boolean };
  tasks: SeedCollection<Task>;
  notes: SeedCollection<Note>;
  whiteboards: SeedCollection<Whiteboard>;
};

// The caller holds the board's serialization queue after awaiting readiness.
// Each collection commits independently; a failed seed is never retried or repaired.
export const persistBoardSeed = Effect.fn("persistBoardSeed")(function* (
  collections: SeedCollections,
  input: unknown,
) {
  const seed = yield* validateBoardSeed(input);
  const { lanes, tasks, notes, whiteboards } = collections;
  const defaultLaneCount = systemLanes.filter((lane) => lanes.has(lane.id)).length;
  if (
    lanes.size !== defaultLaneCount ||
    [tasks, notes, whiteboards].some((collection) => collection.size !== 0)
  ) {
    return false;
  }
  const writes = [
    () => lanes.insert([...seed.lanes]).isPersisted.promise,
    () => collections.tasks.insert([...seed.tasks]).isPersisted.promise,
    () => collections.notes.insert([...seed.notes]).isPersisted.promise,
    ...(seed.whiteboards.length === 0
      ? []
      : [() => collections.whiteboards.insert([...seed.whiteboards]).isPersisted.promise]),
  ];
  yield* Effect.forEach(
    writes,
    (write) =>
      Effect.tryPromise({
        try: write,
        catch: () => new BoardSeedError({ message: "Could not persist board seed collection." }),
      }),
    { discard: true },
  );
  return true;
});
