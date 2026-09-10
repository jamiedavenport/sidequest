import type { Attachment } from "~/board/schema";
import { isPublicHttpUrl } from "~/board/links/extract";

const fallbackInitialCount = 2;

function parsePublicUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return isPublicHttpUrl(url) ? url : undefined;
  } catch {
    return undefined;
  }
}

function readClipboardUrls(data: DataTransfer): string[] {
  const text = data.getData("text/plain").trim();
  if (text) {
    const words = text.split(/\s+/);
    // Leave prose intact, including prose copied as rich HTML.
    return words.every((word) => parsePublicUrl(word)) ? words : [];
  }
  const uriList = data
    .getData("text/uri-list")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"));
  if (uriList.length > 0) {
    return uriList;
  }
  const html = new DOMParser().parseFromString(data.getData("text/html"), "text/html");
  return Array.from(html.querySelectorAll("img[src], video[src], video source[src], a[href]")).map(
    (node) => node.getAttribute("src") ?? node.getAttribute("href") ?? "",
  );
}

function createLinkAttachment(url: URL): Attachment {
  return {
    id: crypto.randomUUID(),
    type: "link",
    source: "manual",
    href: url.href,
    label: url.hostname,
    meta: url.href,
    mark: url.hostname.slice(0, fallbackInitialCount).toUpperCase(),
  };
}

export function readAttachments(data: DataTransfer): { files: File[]; links: Attachment[] } {
  const files = Array.from(data.files);
  if (files.length > 0) {
    return { files, links: [] };
  }
  const urls = readClipboardUrls(data)
    .map(parsePublicUrl)
    .filter((url) => url !== undefined);
  const uniqueUrls = new Map(urls.map((url) => [url.href, url]));
  return { files: [], links: Array.from(uniqueUrls.values(), createLinkAttachment) };
}
