import { Clock, Duration, Effect } from "effect";
import type { MediaAttachment, Task } from "~/board/schema";
import { AttachmentError, isMedia, mediaLimit, uploadProblem, type UploadInput } from "./schema";

export type Upload = {
  attachment: MediaAttachment;
  taskId: string;
  key: string;
  state: "pending" | "ready" | "attached";
  expiresAt: number;
  canceled?: boolean;
};

const uploadPrefix = "media:upload:";

const uploadLifetime = Duration.toMillis("24 hours");

const cleanupInterval = Duration.toMillis("1 hour");

// Allow in-flight writes to finish before deleting a cancelled reservation.
const cancellationGracePeriod = Duration.toMillis("1 hour");

function createUpload(owner: string, input: UploadInput, now: number): Upload {
  const id = crypto.randomUUID();
  return {
    attachment: {
      id,
      type: input.mimeType.startsWith("image/") ? "image" : "video",
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
    },
    taskId: input.taskId,
    key: `${owner}/${id}`,
    state: "pending",
    expiresAt: now + uploadLifetime,
  };
}

export class AttachmentStore {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly bucket: R2Bucket,
    private readonly owner: string,
    private readonly getTask: (id: string) => Task | undefined,
  ) {}

  private isAttached(upload: Upload): boolean {
    const task = this.getTask(upload.taskId);
    return task?.attachments?.some((item) => item.id === upload.attachment.id) ?? false;
  }

  private saveUpload = Effect.fn("AttachmentStore.saveUpload")(function* (
    this: AttachmentStore,
    upload: Upload,
  ) {
    yield* Effect.tryPromise({
      try: () => this.storage.put(uploadPrefix + upload.attachment.id, upload),
      catch: () => new AttachmentError({ message: "Could not save upload state.", status: 503 }),
    });
  });

  private scheduleCleanup = Effect.fn("AttachmentStore.scheduleCleanup")(
    function* (this: AttachmentStore) {
      const now = yield* Clock.currentTimeMillis;
      yield* Effect.tryPromise({
        try: () => this.storage.setAlarm(now + cleanupInterval),
        catch: () =>
          new AttachmentError({ message: "Could not schedule upload cleanup.", status: 503 }),
      });
    },
  );

  private checkUploadCapacity = Effect.fn("AttachmentStore.checkUploadCapacity")(function* (
    this: AttachmentStore,
    taskId: string,
  ) {
    if (this.getTask(taskId)?.completed) {
      return yield* new AttachmentError({ message: "Choose an active task.", status: 409 });
    }
    const uploads = yield* this.listUploads();
    const now = yield* Clock.currentTimeMillis;
    const reserved = [...uploads.values()].filter(
      (upload) =>
        upload.taskId === taskId &&
        !upload.canceled &&
        (upload.expiresAt > now || this.isAttached(upload)),
    );
    if (reserved.length >= mediaLimit) {
      return yield* new AttachmentError({
        message: `A task can have up to ${mediaLimit} media attachments.`,
        status: 400,
      });
    }
    return undefined;
  });

  reserveUpload = Effect.fn("AttachmentStore.reserveUpload")(function* (
    this: AttachmentStore,
    input: UploadInput,
  ) {
    const problem = uploadProblem(input);
    if (problem) {
      return yield* new AttachmentError({ message: problem, status: 400 });
    }
    yield* this.checkUploadCapacity(input.taskId);
    const now = yield* Clock.currentTimeMillis;
    const upload = createUpload(this.owner, input, now);
    yield* this.scheduleCleanup();
    yield* this.saveUpload(upload);
    return upload.attachment;
  });

  getUpload = Effect.fn("AttachmentStore.getUpload")(function* (this: AttachmentStore, id: string) {
    const upload = yield* Effect.tryPromise({
      try: () => this.storage.get<Upload>(uploadPrefix + id),
      catch: () => new AttachmentError({ message: "Could not read attachment.", status: 503 }),
    });
    const now = yield* Clock.currentTimeMillis;
    if (!upload || upload.canceled || (upload.state !== "attached" && upload.expiresAt <= now)) {
      return yield* new AttachmentError({
        message: "Attachment expired or was removed.",
        status: 404,
      });
    }
    return upload;
  });

  private verifyStoredMedia = Effect.fn("AttachmentStore.verifyStoredMedia")(function* (
    this: AttachmentStore,
    upload: Upload,
  ) {
    const object = yield* Effect.tryPromise({
      try: () => this.bucket.head(upload.key),
      catch: () =>
        new AttachmentError({ message: "Could not verify upload. Retry the file.", status: 503 }),
    });
    if (
      !object ||
      object.size !== upload.attachment.size ||
      object.httpMetadata?.contentType !== upload.attachment.mimeType
    ) {
      return yield* new AttachmentError({
        message: "Upload is incomplete. Retry the file.",
        status: 400,
      });
    }
    return undefined;
  });

  finishUpload = Effect.fn("AttachmentStore.finishUpload")(function* (
    this: AttachmentStore,
    id: string,
  ) {
    const upload = yield* this.getUpload(id);
    if (upload.state === "pending") {
      yield* this.verifyStoredMedia(upload);
      yield* this.saveUpload({ ...upload, state: "ready" });
    }
    return upload.attachment;
  });

  private validateAttachment = Effect.fn("AttachmentStore.validateAttachment")(function* (
    this: AttachmentStore,
    taskId: string,
    attachment: MediaAttachment,
  ) {
    const upload = yield* this.getUpload(attachment.id);
    const stored = upload.attachment;
    const belongsToTask = upload.taskId === taskId && upload.state !== "pending";
    const matchesUpload =
      stored.filename === attachment.filename &&
      stored.mimeType === attachment.mimeType &&
      stored.size === attachment.size &&
      stored.type === attachment.type;
    if (!belongsToTask || !matchesUpload) {
      return yield* new AttachmentError({
        message: "Upload this file to this task before attaching it.",
        status: 400,
      });
    }
    return undefined;
  });

  validateAttachments = Effect.fn("AttachmentStore.validateAttachments")(function* (
    this: AttachmentStore,
    task: Task,
  ) {
    const attachments = task.attachments ?? [];
    const media = attachments.filter(isMedia);
    const uniqueIds = new Set(attachments.map((item) => item.id));
    if (media.length > mediaLimit || uniqueIds.size !== attachments.length) {
      return yield* new AttachmentError({
        message: "Too many or duplicate attachments.",
        status: 400,
      });
    }
    return yield* Effect.forEach(
      media,
      (attachment) => this.validateAttachment(task.id, attachment),
      {
        discard: true,
      },
    );
  });

  cancelUpload = Effect.fn("AttachmentStore.cancelUpload")(function* (
    this: AttachmentStore,
    id: string,
  ) {
    const upload = yield* this.getUpload(id);
    if (this.isAttached(upload)) {
      return;
    }
    const now = yield* Clock.currentTimeMillis;
    yield* this.saveUpload({ ...upload, canceled: true, expiresAt: now + cancellationGracePeriod });
  });

  private listUploads = Effect.fn("AttachmentStore.listUploads")(function* (this: AttachmentStore) {
    return yield* Effect.tryPromise({
      try: () => this.storage.list<Upload>({ prefix: uploadPrefix }),
      catch: () => new AttachmentError({ message: "Could not read uploads.", status: 503 }),
    });
  });

  private deleteUpload = Effect.fn("AttachmentStore.deleteUpload")(function* (
    this: AttachmentStore,
    upload: Upload,
  ) {
    yield* Effect.tryPromise({
      try: () => this.bucket.delete(upload.key),
      catch: () => new AttachmentError({ message: "Could not remove attachment.", status: 503 }),
    });
    yield* Effect.tryPromise({
      try: () => this.storage.delete(uploadPrefix + upload.attachment.id),
      catch: () => new AttachmentError({ message: "Could not remove attachment.", status: 503 }),
    });
  });

  private reconcileUpload = Effect.fn("AttachmentStore.reconcileUpload")(function* (
    this: AttachmentStore,
    upload: Upload,
  ) {
    if (this.isAttached(upload)) {
      if (upload.state !== "attached") {
        yield* this.saveUpload({ ...upload, state: "attached" });
      }
      return;
    }
    const now = yield* Clock.currentTimeMillis;
    if (upload.state === "attached" || upload.expiresAt <= now) {
      yield* this.deleteUpload(upload);
    }
  });

  reconcileUploads = Effect.fn("AttachmentStore.reconcileUploads")(
    function* (this: AttachmentStore) {
      const uploads = yield* this.listUploads();
      if (uploads.size === 0) {
        return;
      }
      // Schedule first so a failed delete or interrupted reconciliation is retried.
      yield* this.scheduleCleanup();
      yield* Effect.forEach(uploads.values(), (upload) => this.reconcileUpload(upload), {
        discard: true,
      });
    },
  );
}
