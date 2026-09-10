// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useMemo } from "react";
import { isMedia } from "~/board/attachments/schema";
import { deleteTaskAttachment } from "~/board/data/mutations";
import { useBoardClient } from "~/board/sync/client.tsrx";
import type { Task } from "~/board/types";
import { LinkPreview } from "./link-preview.tsrx";
import { MediaAttachments } from "./media/list.tsrx";

export function TaskAttachments({ task }: { task: Task }) @{
  const client = useBoardClient();
  const media = useMemo(() => task.attachments?.filter(isMedia) ?? [], [task.attachments]);
  const links =
    task.attachments?.filter(
      (attachment) => attachment.type === "link" || attachment.type === "github-issue",
    ) ?? [];
  function deleteAttachment(id: string) {
    deleteTaskAttachment(client, task.id, id);
  }

  @if (task.attachments && task.attachments.length > 0) {
    <div className="pointer-events-auto flex flex-col gap-1 pt-2 text-sm/5 sm:text-[0.6875rem]/4">
      @for (const attachment of links; key attachment.id) {
        <LinkPreview attachment={attachment} />;
      }
      <MediaAttachments attachments={media} onDelete={deleteAttachment} />
    </div>;
  }
}
