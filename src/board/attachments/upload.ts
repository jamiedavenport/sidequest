import { Effect, Schema } from "effect";
import { MediaAttachment } from "~/board/schema";
import { cancelUpload, reserveUpload } from "./functions";
import { AttachmentError, mediaUrl } from "./schema";

const UploadFailure = Schema.Struct({ message: Schema.String });

export const cancelReservedUpload = Effect.fn("cancelReservedUpload")((id: string) =>
  Effect.tryPromise({
    try: () => cancelUpload({ data: { id } }),
    catch: () => new AttachmentError({ message: "Could not cancel upload.", status: 503 }),
  }).pipe(Effect.ignore),
);

const reserveFileUpload = Effect.fn("reserveFileUpload")((taskId: string, file: File) =>
  Effect.tryPromise({
    try: () =>
      reserveUpload({
        data: { taskId, filename: file.name, mimeType: file.type, size: file.size },
      }),
    catch: () =>
      new AttachmentError({
        message: "Could not start upload. Check your connection, subscription, and file limit.",
        status: 400,
      }),
  }),
);

const sendFile = Effect.fn("sendFile")((id: string, file: File, signal: AbortSignal) =>
  Effect.tryPromise({
    try: () =>
      fetch(mediaUrl(id), {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
        signal,
      }),
    catch: () =>
      new AttachmentError({
        message: "Upload interrupted. Retry when you’re online.",
        status: 503,
      }),
  }),
);

const readUploadResponse = Effect.fn("readUploadResponse")(function* (response: Response) {
  const body = yield* Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: () =>
      new AttachmentError({
        message: "Could not read upload response. Retry the file.",
        status: 503,
      }),
  });
  if (!response.ok) {
    const failure = Schema.decodeUnknownOption(UploadFailure)(body);
    const message =
      failure._tag === "Some" ? failure.value.message : "Upload failed. Retry the file.";
    return yield* new AttachmentError({ message, status: response.status });
  }
  return yield* Schema.decodeUnknownEffect(MediaAttachment)(body).pipe(
    Effect.mapError(
      () =>
        new AttachmentError({ message: "Invalid upload response. Retry the file.", status: 503 }),
    ),
  );
});

export const uploadFile = Effect.fn("uploadFile")(function* (
  taskId: string,
  file: File,
  signal: AbortSignal,
  onReserved: (id: string) => void,
) {
  const attachment = yield* reserveFileUpload(taskId, file);
  onReserved(attachment.id);
  return yield* sendFile(attachment.id, file, signal).pipe(
    Effect.flatMap(readUploadResponse),
    Effect.onError(() => cancelReservedUpload(attachment.id)),
  );
});
