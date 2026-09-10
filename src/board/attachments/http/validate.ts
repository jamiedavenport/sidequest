import { Effect } from "effect";
import type { MediaAttachment } from "~/board/schema";
import { AttachmentError } from "../schema";
import { matchesMediaType, mediaInspectionBytes } from "../media-format";

const readMediaPrefix = Effect.fn("readMediaPrefix")(function* (
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  const bytes = new Uint8Array(mediaInspectionBytes);
  let count = 0;
  while (count < bytes.length) {
    const next = yield* Effect.tryPromise({
      try: () => reader.read(),
      catch: () =>
        new AttachmentError({ message: "Could not read the file. Retry the upload.", status: 400 }),
    });
    if (next.done) {
      break;
    }
    const part = next.value.subarray(0, bytes.length - count);
    bytes.set(part, count);
    count += part.length;
  }
  return bytes.subarray(0, count);
});

export const validateMediaBody = Effect.fn("validateMediaBody")(function* (
  request: Request,
  attachment: MediaAttachment,
) {
  const length = Number(request.headers.get("content-length"));
  if (
    !request.body ||
    length !== attachment.size ||
    request.headers.get("content-type") !== attachment.mimeType
  ) {
    return yield* new AttachmentError({
      message: "File size or type does not match the upload.",
      status: 400,
    });
  }

  const [inspect, body] = request.body.tee();
  const reader = inspect.getReader();
  const prefix = yield* readMediaPrefix(reader).pipe(
    Effect.ensuring(
      // A tee branch cannot finish cancelling until the other branch finishes.
      Effect.tryPromise(() => reader.cancel()).pipe(
        Effect.ignore,
        Effect.forkDetach,
        Effect.asVoid,
      ),
    ),
  );
  if (!matchesMediaType(prefix, attachment.mimeType)) {
    yield* Effect.promise(() => body.cancel());
    return yield* new AttachmentError({
      message: "File contents do not match the selected media type.",
      status: 400,
    });
  }
  return body;
});
