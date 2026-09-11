import { Clock, Effect } from "effect";
import type { AttachmentStore } from "~/board/attachments/store";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import type { JournalEntry } from "~/mcp/journal";
import type { BoardCollections } from "../collections";
import { logBoardSync, mutationTelemetry } from "../telemetry";
import { applyMutation } from "./apply";
import { prepareMutations } from "./prepare";
import { reconcileTaskNotes, reconcileTaskWhiteboards, rehomeOrphanTasks } from "./reconcile";
import type { PreparedMutation } from "./schema";

type PersistMutations = (
  mutate: () => void,
  operation: string,
  transactionId?: string,
) => Effect.Effect<void, SyncProtocolError>;

/** The caller owns serialization; this writer owns validation and transaction contents. */
export class BoardMutationWriter {
  constructor(
    private readonly collections: BoardCollections,
    private readonly persist: PersistMutations,
    private readonly validateAttachments: OmitThisParameter<AttachmentStore["validateAttachments"]>,
  ) {}

  prepare(mutations: ReadonlyArray<Mutation>) {
    return prepareMutations(
      mutations,
      (id) => this.collections.tasks.get(id),
      this.validateAttachments,
      (id) => this.collections.lanes.get(id),
    );
  }

  private applyPreparedMutations(prepared: ReadonlyArray<PreparedMutation>): Mutation[] {
    for (const mutation of prepared) {
      applyMutation(this.collections, mutation);
    }
    return prepared.map(({ mutation }) => mutation);
  }

  applyCommand = Effect.fn("BoardMutationWriter.applyCommand")(function* (
    this: BoardMutationWriter,
    entry: JournalEntry<ReadonlyArray<PreparedMutation>>,
  ) {
    yield* this.persist(
      () => {
        const applied = this.applyPreparedMutations(entry.prepared);
        reconcileTaskNotes(this.collections, applied);
        reconcileTaskWhiteboards(this.collections, applied);
      },
      "mcp_command",
      entry.operationId,
    );
  });

  commitMutations = Effect.fn("BoardMutationWriter.commitMutations")(function* (
    this: BoardMutationWriter,
    incoming: ReadonlyArray<Mutation>,
    transactionId: string,
  ) {
    const startedAt = yield* Clock.currentTimeMillis;
    yield* Effect.annotateCurrentSpan({ transactionId, ...mutationTelemetry(incoming) });
    const prepared = yield* this.prepare(incoming);
    let outgoing: Mutation[] = [];
    yield* this.persist(
      () => {
        const applied = this.applyPreparedMutations(prepared);
        // Descendant completions arrive explicitly; deriving them from stale parents breaks queued moves.
        outgoing = [
          ...applied,
          ...rehomeOrphanTasks(this.collections, applied),
          ...reconcileTaskNotes(this.collections, applied),
          ...reconcileTaskWhiteboards(this.collections, applied),
        ];
      },
      "client_mutation",
      transactionId,
    );
    yield* logBoardSync("collection_application", {
      durationMs: (yield* Clock.currentTimeMillis) - startedAt,
      outcome: "success",
      transactionId,
      ...mutationTelemetry(outgoing),
    });
    return outgoing;
  });
}
