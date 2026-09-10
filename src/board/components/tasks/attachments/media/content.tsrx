// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useEffect, useRef, useState } from "react";
import type { MediaAttachment } from "~/board/schema";
import { mediaUrl } from "~/board/attachments/schema";

export function MediaContent({ attachment }: { attachment: MediaAttachment }) @{
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    return () => element?.pause();
  }, []);
  @if (failed) {
    <p className="p-8 text-center text-base sm:text-sm">
      This file cannot be previewed in your browser. Use Download to open it.
    </p>;
  } @else if (attachment.type === "image") {
    <img
      className="max-h-[70dvh] w-full object-contain"
      alt={attachment.filename}
      src={mediaUrl(attachment.id)}
      onError={() => setFailed(true)}
    />;
  } @else {
    // Uploaded videos do not have a generated caption track.
    // oxlint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={video}
      className="max-h-[70dvh] w-full"
      src={mediaUrl(attachment.id)}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
    />;
  }
}
