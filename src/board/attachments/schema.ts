import { Schema } from "effect";
import type { Attachment, MediaAttachment } from "~/board/schema";

export const mediaLimit = 10;

export const maxConcurrentUploads = 3;

const bytesPerMegabyte = 1024 * 1024;

const maxImageMegabytes = 20;

const maxVideoMegabytes = 50;

const maxFilenameLength = 255;

const mediaTypes = {
  "image/jpeg": maxImageMegabytes,
  "image/png": maxImageMegabytes,
  "image/gif": maxImageMegabytes,
  "image/webp": maxImageMegabytes,
  "image/avif": maxImageMegabytes,
  "video/mp4": maxVideoMegabytes,
  "video/webm": maxVideoMegabytes,
  "video/quicktime": maxVideoMegabytes,
} as const;

export const mediaAccept = Object.keys(mediaTypes).join(",");

export const UploadInput = Schema.Struct({
  taskId: Schema.NonEmptyString,
  filename: Schema.NonEmptyString,
  mimeType: Schema.NonEmptyString,
  size: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type UploadInput = typeof UploadInput.Type;

export class AttachmentError extends Schema.TaggedError<AttachmentError>()("AttachmentError", {
  message: Schema.String,
  status: Schema.Number,
}) {}

export function isMedia(attachment: Attachment): attachment is MediaAttachment {
  return attachment.type === "image" || attachment.type === "video";
}

export function uploadProblem(
  input: Pick<UploadInput, "mimeType" | "size" | "filename">,
): string | undefined {
  const limit = Object.entries(mediaTypes).find(([type]) => type === input.mimeType)?.[1];
  if (limit === undefined) {
    return "Choose a JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, or MOV file.";
  }
  if (input.size <= 0 || input.size > limit * bytesPerMegabyte) {
    return `Choose a file smaller than ${limit} MB.`;
  }
  if (input.filename.length > maxFilenameLength) {
    return `Use a filename of ${maxFilenameLength} characters or fewer.`;
  }
  return undefined;
}

export function mediaUrl(id: string, download = false): string {
  return `/api/attachments/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}

export function getAttachmentLabel(attachment: Attachment): string {
  if (isMedia(attachment)) {
    return attachment.filename;
  }
  return attachment.type === "link" ? attachment.label : attachment.title;
}
