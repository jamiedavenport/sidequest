import { Clock, Effect, Schema } from "effect";
import { digest, normalizedInput, planCommand, queryBoard, type BoardState } from "./domain";
import { CommandJournal } from "./journal";
import { ToolError, ToolReply, isWriteTool, type ToolName } from "./schema";
import { Mutation, SyncProtocolError } from "~/sync/protocol";
import type { PreparedMutation } from "~/board/sync/mutations/schema";
import { taskCollectionId } from "~/board/sync/collections";
import { annotateOperation, captureTelemetryContext } from "~/telemetry/runtime";
import { serverRuntime } from "~/server/runtime";

function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) {
    return error;
  }
  return new ToolError({
    code: "internal_error",
    message: "Board operation failed. Retry with the same idempotency key.",
  });
}

function getToolOutcome(reply: ToolReply): string {
  if (reply.ok) {
    return "success";
  }
  return reply.error.code === "internal_error" ? "unexpected_failure" : "expected_rejection";
}

export const callBoardTool = Effect.fn("callBoardTool")(function* (
  name: ToolName,
  execute: () => Promise<ToolReply>,
) {
  const startedAt = yield* Clock.currentTimeMillis;
  const reply: ToolReply = yield* Effect.tryPromise({ try: execute, catch: toToolError }).pipe(
    Effect.catch((error) =>
      Effect.succeed({ ok: false as const, error: { code: error.code, message: error.message } }),
    ),
  );
  yield* Effect.logInfo("mcp.tool").pipe(
    Effect.annotateLogs({
      tool: name,
      durationMs: (yield* Clock.currentTimeMillis) - startedAt,
      outcome: reply.ok ? "success" : reply.error.code,
      operationId: reply.ok ? (reply.result.operationId ?? "") : "",
      replay: reply.ok && reply.replay,
    }),
  );
  annotateOperation({ outcome: getToolOutcome(reply), operation: name });
  return yield* Schema.decodeUnknownEffect(ToolReply)(reply);
});

type ToolDependencies = {
  getState: () => BoardState;
  canMutate: () => Promise<boolean>;
  journal: CommandJournal<ReadonlyArray<PreparedMutation>>;
  prepareMutations: (
    mutations: ReadonlyArray<Mutation>,
  ) => Effect.Effect<PreparedMutation[], SyncProtocolError>;
  enrichTasks: (mutations: ReadonlyArray<Mutation>, operationId: string) => void;
};

/** The caller holds the board serialization queue for the entire command. */
export class BoardTools {
  constructor(private readonly dependencies: ToolDependencies) {}

  private prepareCommand = Effect.fn("BoardTools.prepareCommand")(function* (
    this: BoardTools,
    state: BoardState,
    name: ToolName,
    raw: unknown,
  ) {
    const operationId = crypto.randomUUID();
    const plan = yield* Effect.try({
      try: () => planCommand(state, name, raw, operationId),
      catch: toToolError,
    });
    const taskIds = new Set(state.tasks.map((task) => task.id));
    const mutations = plan.tasks.map(
      (task) =>
        new Mutation({
          collection: taskCollectionId,
          type: taskIds.has(task.id) ? "update" : "insert",
          key: task.id,
          value: task,
        }),
    );
    const prepared = yield* this.dependencies.prepareMutations(mutations);
    return {
      operationId,
      result: plan.result,
      prepared,
      telemetry: captureTelemetryContext(),
      createdAt: yield* Clock.currentTimeMillis,
    };
  });

  private executeWrite = Effect.fn("BoardTools.executeWrite")(function* (
    this: BoardTools,
    clientId: string,
    name: ToolName,
    raw: unknown,
    input: ReturnType<typeof normalizedInput>,
    state: BoardState,
  ) {
    const allowed = yield* Effect.tryPromise({
      try: this.dependencies.canMutate,
      catch: toToolError,
    });
    if (!allowed) {
      return yield* new ToolError({
        code: "billing_required",
        message: "Subscribe or update payment at /billing to resume editing.",
      });
    }
    if (!("idempotencyKey" in input)) {
      return yield* new ToolError({
        code: "invalid_input",
        message: "Writes require an idempotencyKey.",
      });
    }
    const key = yield* Effect.tryPromise({
      try: () => digest({ clientId, key: input.idempotencyKey }),
      catch: toToolError,
    });
    const hash = yield* Effect.tryPromise({
      try: () => digest({ name, input }),
      catch: toToolError,
    });
    const outcome = yield* Effect.tryPromise({
      try: () =>
        this.dependencies.journal.execute(`mcp:command:${key}`, hash, () =>
          serverRuntime.runPromise(this.prepareCommand(state, name, raw)),
        ),
      catch: toToolError,
    });
    const mutations = (outcome.result.affectedTaskIds ?? []).map(
      (id) => new Mutation({ collection: taskCollectionId, key: id, type: "update" }),
    );
    this.dependencies.enrichTasks(mutations, outcome.result.operationId ?? "");
    return { ok: true as const, ...outcome };
  });

  executeTool = Effect.fn("BoardTools.executeTool")(function* (
    this: BoardTools,
    clientId: string,
    name: ToolName,
    raw: unknown,
  ) {
    const input = yield* Effect.try({ try: () => normalizedInput(name, raw), catch: toToolError });
    const state = this.dependencies.getState();
    if (isWriteTool(name)) {
      return yield* this.executeWrite(clientId, name, raw, input, state);
    }
    const result = yield* Effect.tryPromise({
      try: () => queryBoard(state, name, raw),
      catch: toToolError,
    });
    return { ok: true as const, result, replay: false };
  });
}
