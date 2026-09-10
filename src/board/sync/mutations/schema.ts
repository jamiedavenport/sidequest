import type { Lane, Note, Task, Whiteboard } from "~/board/schema";
import type { Mutation } from "~/sync/protocol";
import type {
  laneCollectionId,
  noteCollectionId,
  taskCollectionId,
  whiteboardCollectionId,
} from "../collections";

type PreparedValue<C, V> = { collection: C; mutation: Mutation } & (
  | { value?: never }
  | { value: V }
);

export type PreparedMutation =
  | PreparedValue<typeof laneCollectionId, Lane>
  | PreparedValue<typeof taskCollectionId, Task>
  | PreparedValue<typeof noteCollectionId, Note>
  | PreparedValue<typeof whiteboardCollectionId, Whiteboard>;

export type GetTask = (id: string) => Task | undefined;
