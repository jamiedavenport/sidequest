import { env } from "cloudflare:workers";
import { Effect, Fiber } from "effect";
import type { Upload } from "../store";
import { AttachmentError } from "../schema";
import { validateMediaBody } from "./validate";

const storeMedia = Effect.fn("storeMedia")(
  function* (body: ReadableStream<Uint8Array>, upload: Upload) {
    // R2 needs a known-length stream, which also rejects truncated or oversized bodies.
    const stream = new FixedLengthStream(upload.attachment.size);
    const pumping = yield* Effect.tryPromise((signal) =>
      body.pipeTo(stream.writable, { signal }),
    ).pipe(Effect.forkScoped);

    const object = yield* Effect.tryPromise(() =>
      env.ATTACHMENTS.put(upload.key, stream.readable, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: upload.attachment.mimeType },
      }),
    );
    if (object) {
      yield* Fiber.join(pumping);
    } else {
      // A retried upload already exists; stop consuming this request's body.
      yield* Effect.tryPromise(() => stream.readable.cancel());
    }
  },
  Effect.scoped,
  Effect.mapError(
    () => new AttachmentError({ message: "Upload failed. Retry the file.", status: 503 }),
  ),
);

export const writeMedia = Effect.fn("writeMedia")(function* (
  request: Request,
  userId: string,
  upload: Upload,
) {
  if (upload.state !== "pending") {
    return Response.json(upload.attachment);
  }
  const body = yield* validateMediaBody(request, upload.attachment);
  yield* storeMedia(body, upload);
  const attachment = yield* Effect.tryPromise({
    try: () => env.BOARD.getByName(userId).finishUpload(userId, upload.attachment.id),
    catch: () =>
      new AttachmentError({
        message: "Upload expired or could not finish. Retry the file.",
        status: 409,
      }),
  });
  return Response.json(attachment);
});
