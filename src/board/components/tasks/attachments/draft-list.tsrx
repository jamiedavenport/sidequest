// oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop
import { Paperclip, RotateCcw, X } from "lucide-react";
import type { DraftAttachment } from "~/board/attachments/draft";
import type { AttachmentDraft } from "~/board/attachments/use-attachment-draft";
import { getAttachmentLabel, isMedia } from "~/board/attachments/schema";
import { Button } from "~/components/ui/button.tsrx";
import { MediaAttachments } from "~/board/components/tasks/attachments/media/list.tsrx";
import { MediaThumbnail } from "~/board/components/tasks/attachments/media/thumbnail.tsrx";
import { WebsiteIcon } from "~/board/components/tasks/attachments/website-icon.tsrx";
import { cn } from "~/lib/utils";

function DraftAttachmentItem({
  entry,
  draft,
  className,
}: {
  entry: DraftAttachment;
  draft: AttachmentDraft;
  className?: string;
}) @{
  const attachment = entry.attachment;
  const media = attachment && isMedia(attachment) ? attachment : undefined;
  const label = entry.file?.name ?? (attachment ? getAttachmentLabel(attachment) : "attachment");
  <li
    className={cn(
      "flex max-w-full min-w-0 items-center gap-2 rounded-md bg-muted/50 p-2 text-sm sm:text-xs",
      className,
    )}
  >
    @if (media) {
      <MediaAttachments
        attachments={[media]}
        compact
        onDelete={() => draft.remove(entry.id)}
      />;
    } @else if (entry.file) {
      <MediaThumbnail
        type={entry.file.type.startsWith("image/") ? "image" : "video"}
        src={entry.url}
      />;
    } @else if (attachment?.type === "link") {
      <WebsiteIcon href={attachment.href} icon={attachment.icon} />;
    } @else {
      <Paperclip className="size-4 shrink-0" aria-hidden="true" />;
    }
    <p className={entry.file || media ? "sr-only" : "min-w-0 truncate"}>{label}</p>
    @if (entry.error) {
      <output className="min-w-0 text-destructive" aria-live="polite">
        {entry.error}
      </output>;
    }
    @if (entry.status === "failed") {
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Retry ${label}`}
        onClick={() => draft.retry(entry.id)}
      >
        <RotateCcw />
      </Button>;
    }
    @if (attachment?.type !== "github-issue") {
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${label}`}
        onClick={() => draft.remove(entry.id)}
      >
        <X />
      </Button>;
    }
  </li>;
}

export function AttachmentDraftList({
  draft,
  pendingOnly = false,
  className,
}: {
  draft: AttachmentDraft;
  pendingOnly?: boolean;
  className?: string;
}) @{
  const entries = draft.entries.filter((entry) => !pendingOnly || !entry.saved);
  @if (entries.length > 0 || draft.error) {
    <div className={cn("grid w-full min-w-0 gap-2 p-2", className)} data-attachment-drafts="">
      @if (draft.error) {
        <p className="text-sm text-destructive" role="alert">
          {draft.error}
        </p>;
      }
      <ul className="flex flex-wrap items-start justify-start gap-2">
        @for (const entry of entries; key entry.id) {
          <DraftAttachmentItem entry={entry} draft={draft} />;
        }
      </ul>
    </div>;
  }
}
