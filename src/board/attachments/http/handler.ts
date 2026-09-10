import { env } from "cloudflare:workers";
import { Effect } from "effect";
import { serverRuntime } from "~/server/runtime";
import { AttachmentError } from "../schema";
import { getAttachmentUser } from "../security";
import { writeMedia } from "./upload";
import { downloadMedia } from "./download";

const getUpload = Effect.fn("getUpload")((userId: string, id: string, write: boolean) =>
  Effect.tryPromise({
    try: () => env.BOARD.getByName(userId).getUpload(userId, id, write),
    catch: () =>
      new AttachmentError({
        message: "Attachment unavailable. Check your session and subscription.",
        status: 404,
      }),
  }),
);

const serveMedia = Effect.fn("serveMedia")(function* (request: Request, id: string) {
  const write = request.method === "PUT";
  const userId = yield* getAttachmentUser(request.headers, write);
  const upload = yield* getUpload(userId, id, write);
  if (write) {
    return yield* writeMedia(request, userId, upload);
  }
  return yield* downloadMedia(request, upload);
});

export function handleMediaRequest(request: Request, id: string) {
  return serverRuntime.runPromise(
    serveMedia(request, id).pipe(
      Effect.catch((error) =>
        Effect.succeed(Response.json({ message: error.message }, { status: error.status })),
      ),
    ),
  );
}
