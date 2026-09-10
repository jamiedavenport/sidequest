import { Effect, Schema } from "effect";

export const syncProtocolVersion = 3;

const MutationType = Schema.Literals(["insert", "update", "delete"]);

export class SyncProtocolError extends Schema.TaggedError<SyncProtocolError>()(
  "SyncProtocolError",
  {
    message: Schema.String,
  },
) {}

export class Mutation extends Schema.Class<Mutation>("Mutation")({
  collection: Schema.String,
  type: MutationType,
  key: Schema.String,
  value: Schema.optionalKey(Schema.Unknown),
  originalAttachmentIds: Schema.optionalKey(Schema.Array(Schema.String)),
}) {}

export class Sync extends Schema.TaggedClass<Sync>()("Sync", {
  telemetry: Schema.optionalKey(Schema.Unknown),
}) {}

export class Mutate extends Schema.TaggedClass<Mutate>()("Mutate", {
  telemetry: Schema.optionalKey(Schema.Unknown),
  transactionId: Schema.String,
  idempotencyKey: Schema.optionalKey(Schema.String),
  mutations: Schema.Array(Mutation),
}) {}

const ClientMessage = Schema.Union([Sync, Mutate]);

export class CollectionSnapshot extends Schema.Class<CollectionSnapshot>("CollectionSnapshot")({
  collection: Schema.String,
  values: Schema.Array(Schema.Unknown),
}) {}

export class Snapshot extends Schema.TaggedClass<Snapshot>()("Snapshot", {
  telemetry: Schema.optionalKey(Schema.Unknown),
  collections: Schema.Array(CollectionSnapshot),
}) {}

export class Changes extends Schema.TaggedClass<Changes>()("Changes", {
  telemetry: Schema.optionalKey(Schema.Unknown),
  changeId: Schema.optionalKey(Schema.String),
  originatingTransactionId: Schema.optionalKey(Schema.String),
  mutations: Schema.Array(Mutation),
}) {}

export class Ack extends Schema.TaggedClass<Ack>()("Ack", {
  telemetry: Schema.optionalKey(Schema.Unknown),
  transactionId: Schema.String,
}) {}

export class Reject extends Schema.TaggedClass<Reject>()("Reject", {
  telemetry: Schema.optionalKey(Schema.Unknown),
  code: Schema.optionalKey(Schema.Literals(["billing_required", "temporarily_unavailable"])),
  transactionId: Schema.String,
  message: Schema.String,
}) {}

export function acknowledgedChanges(input: {
  changeId: string;
  mutations: ReadonlyArray<Mutation>;
  transactionId: string;
}): readonly [Ack, Changes] {
  return [
    new Ack({ transactionId: input.transactionId }),
    new Changes({
      changeId: input.changeId,
      originatingTransactionId: input.transactionId,
      mutations: input.mutations,
    }),
  ];
}

const ServerMessage = Schema.Union([Snapshot, Changes, Ack, Reject]);

export const decodeClientMessage = Effect.fn("decodeClientMessage")(function* (input: unknown) {
  return yield* Schema.decodeUnknownEffect(ClientMessage)(input);
});

export const decodeServerMessage = Effect.fn("decodeServerMessage")(function* (input: unknown) {
  return yield* Schema.decodeUnknownEffect(ServerMessage)(input);
});
