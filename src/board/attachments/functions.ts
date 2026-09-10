import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env as bindings } from "cloudflare:workers";
import { Effect, Schema } from "effect";
import { serverRuntime } from "~/server/runtime";
import { AttachmentError, mediaLimit, UploadInput } from "./schema";
import { getAttachmentUser } from "./security";

const reserveUserUpload = Effect.fn("reserveUserUpload")(function* (input: UploadInput) {
  const userId = yield* getAttachmentUser(getRequestHeaders(), true);
  const { id, type, filename, mimeType, size } = yield* Effect.tryPromise({
    try: () => bindings.BOARD.getByName(userId).reserveUpload(userId, input),
    catch: () =>
      new AttachmentError({
        message: `Could not reserve upload. Check your connection, subscription, and the ${mediaLimit}-file limit.`,
        status: 400,
      }),
  });
  // Return serializable data rather than the Durable Object RPC proxy.
  return { id, type, filename, mimeType, size };
});

const cancelUserUpload = Effect.fn("cancelUserUpload")(function* (id: string) {
  const userId = yield* getAttachmentUser(getRequestHeaders(), true);
  yield* Effect.tryPromise({
    try: () => bindings.BOARD.getByName(userId).cancelUpload(userId, id),
    catch: () =>
      new AttachmentError({
        message: "Could not cancel upload. Unused uploads expire automatically.",
        status: 503,
      }),
  });
  return { ok: true };
});

export const reserveUpload = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(UploadInput))
  .handler(({ data }) => serverRuntime.runPromise(reserveUserUpload(data)));

export const cancelUpload = createServerFn({ method: "POST" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.NonEmptyString })))
  .handler(({ data }) => serverRuntime.runPromise(cancelUserUpload(data.id)));
