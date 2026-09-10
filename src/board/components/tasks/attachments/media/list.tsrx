// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { MediaAttachment } from "~/board/schema";
import { mediaUrl } from "~/board/attachments/schema";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "~/components/ui/context-menu.tsrx";
import { MediaPreview } from "~/board/components/tasks/attachments/media/preview.tsrx";
import { MediaThumbnail } from "~/board/components/tasks/attachments/media/thumbnail.tsrx";
import { cn } from "~/lib/utils";

export function MediaAttachments({
  attachments,
  compact = false,
  onDelete,
  className,
}: {
  attachments: ReadonlyArray<MediaAttachment>;
  compact?: boolean;
  onDelete: (id: string) => void;
  className?: string;
}) @{
  const [selectedId, setSelectedId] = useState<string>();
  const trigger = useRef<HTMLElement | null>(null);
  function deleteAttachment(id: string) {
    setSelectedId(undefined);
    onDelete(id);
  }

  <div className={cn("flex flex-wrap items-start gap-2", className)}>
    @for (const attachment of attachments; key attachment.id) {
      <ContextMenu>
        <ContextMenuTrigger
          render={<button type="button" aria-label={attachment.filename} />}
          className={cn(
            "shrink-0 rounded-md hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
            !compact &&
              "flex min-w-0 items-center gap-2 bg-foreground/2 p-2 text-left text-sm outline-1 outline-border sm:text-xs",
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            trigger.current = event.currentTarget;
            setSelectedId(attachment.id);
          }}
        >
          <MediaThumbnail type={attachment.type} src={mediaUrl(attachment.id)} />
          <span className={compact ? "sr-only" : "min-w-0 truncate"}>
            {attachment.filename}
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <ContextMenuItem
            variant="destructive"
            onClick={() => deleteAttachment(attachment.id)}
          >
            <Trash2 />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>;
    }
    <MediaPreview
      media={attachments}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onDelete={deleteAttachment}
      returnFocus={trigger}
    />
  </div>;
}
