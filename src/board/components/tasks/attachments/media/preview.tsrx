import { MediaContent } from "./content.tsrx";
import { MediaNavigation } from "./navigation.tsrx";
// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { type RefObject } from "react";
import { Download, Trash2 } from "lucide-react";
import type { MediaAttachment } from "~/board/schema";
import { mediaUrl } from "~/board/attachments/schema";
import { Button } from "~/components/ui/button.tsrx";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "~/components/ui/dialog.tsrx";
import { cn } from "~/lib/utils";

export function MediaPreview({
  media,
  selectedId,
  onSelect,
  onDelete,
  returnFocus,
  className,
}: {
  media: ReadonlyArray<MediaAttachment>;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onDelete: (id: string) => void;
  returnFocus: RefObject<HTMLElement | null>;
  className?: string;
}) @{
  const index = media.findIndex((attachment) => attachment.id === selectedId);
  const current = media[index];
  function navigate(direction: -1 | 1) {
    const next = media[index + direction];
    if (next) {
      onSelect(next.id);
    }
  }

  <Dialog
    open={current !== undefined}
    onOpenChange={(open) => {
      if (!open) {
        onSelect(undefined);
      }
    }}
  >
    <DialogContent
      className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl", className)}
      finalFocus={returnFocus}
      onKeyDown={(event) => {
        if (!(event.target instanceof HTMLVideoElement)) {
          if (event.key === "ArrowLeft") {
            navigate(-1);
          }
          if (event.key === "ArrowRight") {
            navigate(1);
          }
        }
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      @if (current) {
        <>
          <DialogTitle className="min-w-0 truncate pr-8">{current.filename}</DialogTitle>
          <DialogDescription className="sr-only">
            Attachment preview. Use the arrows to browse photos and videos.
          </DialogDescription>
          <MediaContent key={current.id} attachment={current} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MediaNavigation index={index} count={media.length} onNavigate={navigate} />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDelete(current.id)}
              >
                <Trash2 />
                Delete
              </Button>
              <Button
                render={
                  <a
                    href={mediaUrl(current.id, true)}
                    download={current.filename}
                    aria-label={`Download ${current.filename}`}
                  />
                }
                variant="outline"
                size="sm"
              >
                <Download />
                Download
              </Button>
            </div>
          </div>
        </>;
      }
    </DialogContent>
  </Dialog>;
}
