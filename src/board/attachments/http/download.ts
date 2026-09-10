import { env } from "cloudflare:workers";
import { Effect } from "effect";
import type { MediaAttachment } from "~/board/schema";
import type { Upload } from "../store";
import { AttachmentError } from "../schema";
import { parseByteRange, type ByteRange } from "./range";

const readMedia = Effect.fn("readMedia")(function* (key: string, range?: ByteRange) {
  const object = yield* Effect.tryPromise({
    try: () =>
      env.ATTACHMENTS.get(key, {
        range: range && { offset: range.start, length: range.end - range.start + 1 },
      }),
    catch: () =>
      new AttachmentError({ message: "Could not load attachment. Try again.", status: 503 }),
  });
  if (!object) {
    return yield* new AttachmentError({ message: "Attachment was removed.", status: 404 });
  }
  return object;
});

function createMediaHeaders(request: Request, attachment: MediaAttachment, range?: ByteRange) {
  const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
  const filename = encodeURIComponent(attachment.filename).replaceAll("'", "%27");
  const length = range ? range.end - range.start + 1 : attachment.size;
  const headers = new Headers({
    "Content-Type": attachment.mimeType,
    "Content-Length": String(length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
  });
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${attachment.size}`);
  }
  return headers;
}

export const downloadMedia = Effect.fn("downloadMedia")(function* (
  request: Request,
  upload: Upload,
) {
  if (upload.state === "pending") {
    return yield* new AttachmentError({ message: "Upload is not ready.", status: 404 });
  }
  const headOnly = request.method === "HEAD";
  const rangeHeader = request.headers.get("range");
  let range: ByteRange | undefined;
  if (rangeHeader && !headOnly) {
    range = parseByteRange(rangeHeader, upload.attachment.size);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${upload.attachment.size}` },
      });
    }
  }
  const object = yield* readMedia(upload.key, range);
  if (headOnly) {
    yield* Effect.promise(() => object.body.cancel());
  }
  return new Response(headOnly ? null : object.body, {
    status: range ? 206 : 200,
    headers: createMediaHeaders(request, upload.attachment, range),
  });
});
