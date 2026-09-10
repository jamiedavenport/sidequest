import { Effect, Semaphore } from "effect";
import type { Attachment, MediaAttachment } from "~/board/schema";
import { isMedia, maxConcurrentUploads, mediaLimit, uploadProblem } from "./schema";
import { cancelReservedUpload, uploadFile } from "./upload";

export type DraftAttachment = {
  id: string;
  taskId: string;
  attachment?: Attachment;
  file?: File;
  url?: string;
  reservedId?: string;
  controller?: AbortController;
  status: "queued" | "uploading" | "ready" | "failed";
  error?: string;
  saved?: boolean;
};

type DraftSnapshot = {
  entries: DraftAttachment[];
  attachments: Attachment[];
  ready: boolean;
  error?: string;
};

const releaseDraftEntry = Effect.fn("releaseDraftEntry")(function* (entry: DraftAttachment) {
  entry.controller?.abort();
  if (entry.url) {
    URL.revokeObjectURL(entry.url);
  }
  if (entry.reservedId && !entry.saved) {
    yield* cancelReservedUpload(entry.reservedId);
  }
});

function createFileEntry(taskId: string, file: File): DraftAttachment {
  const error = uploadProblem({ filename: file.name, mimeType: file.type, size: file.size });
  return {
    id: crypto.randomUUID(),
    taskId,
    file,
    error,
    url: error ? undefined : URL.createObjectURL(file),
    status: error ? "failed" : "queued",
  };
}

export class AttachmentDraftStore {
  private entries: DraftAttachment[];
  private error?: string;
  private snapshot: DraftSnapshot = { entries: [], attachments: [], ready: true };
  private listeners = new Set<() => void>();
  private uploads = Semaphore.makeUnsafe(maxConcurrentUploads);
  active = true;
  onAttach?: (attachment: Attachment) => void;

  constructor(taskId: string, attachments: ReadonlyArray<Attachment>) {
    this.entries = attachments.map((attachment) => ({
      id: attachment.id,
      taskId,
      attachment,
      status: "ready",
      saved: true,
    }));
    this.publish();
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish() {
    this.snapshot = {
      entries: this.entries.map((entry) => ({ ...entry })),
      attachments: this.entries.flatMap((entry) => (entry.attachment ? [entry.attachment] : [])),
      ready: this.entries.every((entry) => entry.status === "ready"),
      error: this.error,
    };
    this.listeners.forEach((listener) => listener());
  }

  private finishUpload(entry: DraftAttachment, attachment: MediaAttachment) {
    entry.attachment = attachment;
    entry.status = "ready";
    if (this.active && this.entries.includes(entry) && this.onAttach) {
      this.onAttach(attachment);
      entry.saved = true;
    }
  }

  private uploadEntry = Effect.fn("AttachmentDraftStore.uploadEntry")(function* (
    this: AttachmentDraftStore,
    entry: DraftAttachment,
  ) {
    if (!entry.file || !this.active || !this.entries.includes(entry)) {
      return;
    }
    entry.status = "uploading";
    entry.controller = new AbortController();
    this.publish();
    yield* uploadFile(entry.taskId, entry.file, entry.controller.signal, (id) => {
      entry.reservedId = id;
    }).pipe(
      Effect.match({
        onFailure: (error) => {
          entry.status = "failed";
          entry.error = error.message;
        },
        onSuccess: (attachment) => this.finishUpload(entry, attachment),
      }),
    );
    this.publish();
  });

  private countMedia(): number {
    return this.entries.filter((entry) => {
      if (this.onAttach && entry.saved) {
        return false;
      }
      return (
        entry.file !== undefined || (entry.attachment !== undefined && isMedia(entry.attachment))
      );
    }).length;
  }

  addFiles = Effect.fn("AttachmentDraftStore.addFiles")(function* (
    this: AttachmentDraftStore,
    taskId: string,
    files: ReadonlyArray<File>,
    existingMedia: number,
  ): Effect.fn.Return<void> {
    this.error = undefined;
    const added: DraftAttachment[] = [];
    for (const file of files) {
      if (this.countMedia() + existingMedia >= mediaLimit) {
        this.error = `A task can have up to ${mediaLimit} media attachments.`;
        break;
      }
      const entry = createFileEntry(taskId, file);
      this.entries.push(entry);
      if (entry.status === "queued") {
        added.push(entry);
      }
    }
    this.publish();
    yield* Effect.forEach(added, (entry) => this.uploads.withPermit(this.uploadEntry(entry)), {
      concurrency: maxConcurrentUploads,
      discard: true,
    });
  });

  addLinks(taskId: string, links: ReadonlyArray<Attachment>, existing: ReadonlyArray<Attachment>) {
    const attachments = [...existing, ...this.snapshot.attachments];
    const hrefs = new Set(attachments.flatMap((item) => ("href" in item ? [item.href] : [])));
    for (const attachment of links) {
      if (!("href" in attachment) || hrefs.has(attachment.href)) {
        continue;
      }
      hrefs.add(attachment.href);
      this.entries.push({
        id: attachment.id,
        taskId,
        attachment,
        status: "ready",
        saved: this.onAttach !== undefined,
      });
      this.onAttach?.(attachment);
    }
    this.publish();
  }

  remove = Effect.fn("AttachmentDraftStore.remove")(function* (
    this: AttachmentDraftStore,
    id: string,
  ) {
    const entry = this.entries.find((item) => item.id === id);
    this.entries = this.entries.filter((item) => item.id !== id);
    this.publish();
    if (entry) {
      yield* releaseDraftEntry(entry);
    }
  });

  retry = Effect.fn("AttachmentDraftStore.retry")(function* (
    this: AttachmentDraftStore,
    id: string,
  ) {
    const entry = this.entries.find((item) => item.id === id);
    if (
      !entry?.file ||
      uploadProblem({ filename: entry.file.name, mimeType: entry.file.type, size: entry.file.size })
    ) {
      return;
    }
    if (entry.reservedId) {
      yield* cancelReservedUpload(entry.reservedId);
    }
    entry.reservedId = undefined;
    entry.error = undefined;
    entry.status = "queued";
    this.publish();
    yield* this.uploads.withPermit(this.uploadEntry(entry));
  });

  reset = Effect.fn("AttachmentDraftStore.reset")(function* (
    this: AttachmentDraftStore,
    saved = false,
  ) {
    const entries = this.entries;
    this.entries = [];
    this.error = undefined;
    this.publish();
    yield* Effect.forEach(
      entries,
      (entry) => {
        if (saved) {
          entry.saved = true;
        }
        return releaseDraftEntry(entry);
      },
      { discard: true },
    );
  });
  dispose = Effect.fn("AttachmentDraftStore.dispose")(
    function* (this: AttachmentDraftStore): Effect.fn.Return<void> {
      this.active = false;
      yield* Effect.forEach(this.entries, (entry) => releaseDraftEntry(entry), { discard: true });
    },
  );
}
