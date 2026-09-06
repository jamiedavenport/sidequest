import { Effect } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { LinkPreviewError } from "~/board/links/errors";
import { isPublicHttpUrl } from "~/board/links/extract";
import type { Attachment } from "~/board/schema";

const previewTimeout = "3 seconds";

const previewUserAgent = "Sidequest/0.0 (link preview)";

export function fallbackAttachment(url: URL): Attachment {
  const host = displayHost(url);
  return {
    id: crypto.randomUUID(),
    type: "link",
    label: host,
    meta: host,
    href: url.href,
    mark: attachmentMark(url),
    icon: duckDuckGoIcon(url),
  };
}

export const resolveLinkPreview = Effect.fn("resolveLinkPreview")(function* (url: URL) {
  const startedAt = Date.now();
  if (!isPublicHttpUrl(url)) {
    return yield* new LinkPreviewError({ url: url.href, reason: "blocked" });
  }

  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest((request) =>
      HttpClientRequest.setHeaders(request, {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": previewUserAgent,
      }),
    ),
  );

  const html = yield* client.get(url.href).pipe(
    Effect.flatMap(readPreviewHtml),
    Effect.timeout(previewTimeout),
    Effect.tapError(() =>
      Effect.logWarning("link-preview.lifecycle").pipe(
        Effect.annotateLogs({
          component: "sync-server",
          durationMs: Date.now() - startedAt,
          event: "preview_request_finished",
          outcome: "failure",
        }),
      ),
    ),
    Effect.mapError((cause) => new LinkPreviewError({ url: url.href, reason: "http", cause })),
  );
  if (html.trim() === "") {
    return yield* new LinkPreviewError({ url: url.href, reason: "parse" });
  }

  const attachment = attachmentFromHtml(url, html);
  yield* Effect.logInfo("link-preview.lifecycle").pipe(
    Effect.annotateLogs({
      component: "sync-server",
      durationMs: Date.now() - startedAt,
      event: "preview_request_finished",
      outcome: "success",
      responseSize: html.length,
    }),
  );
  return attachment;
});

const readPreviewHtml = Effect.fn("readPreviewHtml")(function* (
  response: HttpClientResponse.HttpClientResponse,
) {
  const html = yield* response.text;
  yield* HttpClientResponse.filterStatusOk(response);
  return html;
});

function attachmentFromHtml(url: URL, html: string): Attachment {
  const host = displayHost(url);
  const github = githubRef(url);
  const title = firstText(metaContent(html, ["og:title", "twitter:title"]), pageTitle(html));
  const description = metaContent(html, ["og:description", "twitter:description"]);
  const attachment: Attachment = {
    id: crypto.randomUUID(),
    type: "link",
    label: title ?? (github === undefined ? host : `${github.owner}/${github.repo}`),
    meta: description ?? (github === undefined ? host : githubLabel(github)),
    href: url.href,
    mark: attachmentMark(url),
    icon: iconFromHtml(url, html) ?? duckDuckGoIcon(url),
  };
  if (github?.number === undefined) {
    return attachment;
  }

  return {
    ...attachment,
    stat: `#${github.number}`,
  };
}

function attachmentMark(url: URL): string {
  const host = displayHost(url);
  if (host === "github.com") {
    return "GH";
  }

  return host.slice(0, 2).toUpperCase();
}

function displayHost(url: URL): string {
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}

function duckDuckGoIcon(url: URL): string {
  return `https://icons.duckduckgo.com/ip3/${displayHost(url)}.ico`;
}

function iconFromHtml(page: URL, html: string): string | undefined {
  let fallback: string | undefined;
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (tag === undefined) {
      continue;
    }

    const rel = attribute(tag, "rel")?.toLowerCase();
    const href = attribute(tag, "href");
    if (rel === undefined || href === undefined) {
      continue;
    }

    const kinds = new Set(rel.split(/\s+/));
    if (
      !kinds.has("icon") &&
      !kinds.has("apple-touch-icon") &&
      !kinds.has("apple-touch-icon-precomposed")
    ) {
      continue;
    }

    const resolved = publicIconUrl(page, href);
    if (resolved === undefined) {
      continue;
    }

    if (kinds.has("apple-touch-icon") || kinds.has("apple-touch-icon-precomposed")) {
      return resolved;
    }

    fallback ??= resolved;
  }

  return fallback;
}

function publicIconUrl(page: URL, href: string): string | undefined {
  let resolved: URL;
  try {
    resolved = new URL(href, page);
  } catch {
    return undefined;
  }

  return isPublicHttpUrl(resolved) ? resolved.href : undefined;
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(
    `${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  ).exec(tag);
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function githubRef(url: URL): { owner: string; repo: string; number?: string } | undefined {
  if (displayHost(url) !== "github.com") {
    return undefined;
  }

  const [owner, repo, kind, number] = url.pathname.split("/").filter((segment) => segment !== "");
  if (owner === undefined || repo === undefined) {
    return undefined;
  }

  if ((kind === "issues" || kind === "pull" || kind === "discussions") && number !== undefined) {
    return { owner, repo, number };
  }

  return { owner, repo };
}

function githubLabel(ref: { owner: string; repo: string; number?: string }): string {
  return ref.number === undefined
    ? `${ref.owner}/${ref.repo}`
    : `${ref.owner}/${ref.repo}#${ref.number}`;
}

function pageTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return decodeHtmlEntities(match?.[1] ?? "");
}

function metaContent(html: string, keys: ReadonlyArray<string>): string | undefined {
  for (const key of keys) {
    const escaped = escapeRegExp(key);
    const propertyFirst = new RegExp(
      `<meta\\s+[^>]*?(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*?content\\s*=\\s*["']([^"']*)["']`,
      "i",
    );
    const contentFirst = new RegExp(
      `<meta\\s+[^>]*?content\\s*=\\s*["']([^"']*)["'][^>]*?(?:property|name)\\s*=\\s*["']${escaped}["']`,
      "i",
    );
    const value = decodeHtmlEntities(
      (html.match(propertyFirst) ?? html.match(contentFirst))?.[1] ?? "",
    );
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function firstText(...values: ReadonlyArray<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined);
}

function decodeHtmlEntities(value: string): string | undefined {
  const decoded = value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec: string) => fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/\s+/g, " ")
    .trim();
  return decoded === "" ? undefined : decoded;
}

function fromCodePoint(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) {
    return "";
  }

  return String.fromCodePoint(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
