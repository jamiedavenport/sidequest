// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useState } from "react";
import { ImageIcon, Video } from "lucide-react";
import { cn } from "~/lib/utils";

export function MediaThumbnail({
  type,
  src,
  className,
}: {
  type: "image" | "video";
  src?: string;
  className?: string;
}) @{
  const [failed, setFailed] = useState(false);
  @if (type === "image" && src && !failed) {
    <img
      className={cn(
        "size-5 shrink-0 rounded-sm object-cover outline-1 -outline-offset-1 outline-foreground/5",
        className,
      )}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />;
  } @else if (type === "video") {
    <Video className={cn("size-6 shrink-0 text-muted-foreground", className)} aria-hidden="true" />;
  } @else {
    <ImageIcon
      className={cn("size-6 shrink-0 text-muted-foreground", className)}
      aria-hidden="true"
    />;
  }
}
