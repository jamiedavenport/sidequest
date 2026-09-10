import type { Attachment } from "~/board/types";
import { GitHubIcon } from "~/github/icon.tsrx";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item.tsrx";
import { cn } from "~/lib/utils";
import { WebsiteIcon } from "./website-icon.tsrx";

export function LinkPreview({
  attachment,
}: {
  attachment: Exclude<Attachment, { type: "image" | "video" }>;
}) @{
  const github = attachment.type === "github-issue";
  const label = github ? `${attachment.repository} #${attachment.number}` : attachment.label;
  const meta = github ? attachment.title : attachment.meta;

  <Item
    className="min-w-0 flex-nowrap bg-foreground/2 text-foreground no-underline"
    href={attachment.href}
    rel="noreferrer"
    size="xs"
    target="_blank"
    variant="outline"
  >
    <ItemMedia
      className={cn(
        "size-7.5 rounded-md sm:size-6.25",
        github
          ? "bg-foreground text-background"
          : "overflow-hidden bg-secondary p-0.5 [&_img]:object-contain",
      )}
      variant={github ? "default" : "image"}
      aria-hidden="true"
    >
      @if (github) {
        <GitHubIcon className="size-4" />;
      } @else {
        <WebsiteIcon href={attachment.href} icon={attachment.icon} />;
      }
    </ItemMedia>
    <ItemContent>
      <ItemTitle className="text-sm/5 text-foreground sm:text-xs/4">{label}</ItemTitle>
      <ItemDescription className="line-clamp-1 text-sm/5 sm:text-xs/4">{meta}</ItemDescription>
    </ItemContent>
  </Item>;
}
