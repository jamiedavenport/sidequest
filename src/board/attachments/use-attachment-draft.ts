import { Effect } from "effect";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Attachment } from "~/board/schema";
import { readAttachments } from "./clipboard";
import { AttachmentDraftStore } from "./draft";
import { isMedia } from "./schema";

export function useAttachmentDraft(
  taskId: string,
  initial: ReadonlyArray<Attachment> = [],
  onAttach?: (attachment: Attachment) => void,
) {
  const [store] = useState(() => new AttachmentDraftStore(taskId, initial));
  store.onAttach = onAttach;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.active = true;
    return () => {
      Effect.runFork(store.dispose());
    };
  }, [store]);

  function addFiles(files: ReadonlyArray<File>, existingMedia = 0) {
    Effect.runFork(store.addFiles(taskId, files, existingMedia));
  }

  function paste(
    event: { clipboardData: DataTransfer; preventDefault(): void; stopPropagation(): void },
    existing: ReadonlyArray<Attachment> = [],
  ) {
    const { files, links } = readAttachments(event.clipboardData);
    if (files.length === 0 && links.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    addFiles(files, existing.filter(isMedia).length);
    store.addLinks(taskId, links, existing);
  }

  return {
    ...snapshot,
    addFiles,
    paste,
    remove: (id: string) => {
      Effect.runFork(store.remove(id));
    },
    retry: (id: string) => {
      Effect.runFork(store.retry(id));
    },
    reset: (saved = false) => {
      Effect.runFork(store.reset(saved));
    },
  };
}

export type AttachmentDraft = ReturnType<typeof useAttachmentDraft>;
