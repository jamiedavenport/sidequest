// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { Globe } from "lucide-react";
import { useState } from "react";

function getWebsiteIconUrl(href: string): string | undefined {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  } catch {
    return undefined;
  }
}

export function WebsiteIcon({ href, icon }: { href: string; icon?: string }) @{
  const src = icon ?? getWebsiteIconUrl(href);
  const [failedSrc, setFailedSrc] = useState<string>();

  @if (src && src !== failedSrc) {
    <img
      className="size-4 shrink-0 object-contain"
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />;
  } @else {
    <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
}
