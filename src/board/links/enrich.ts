import { env } from "~/env";
import { Effect } from "effect";
import { HttpClient } from "effect/unstable/http";

import { LinkPreviewError } from "~/board/links/errors";
import { extractHttpUrls } from "~/board/links/extract";
import { fallbackAttachment, resolveLinkPreview } from "~/board/links/preview";
import type { Attachment } from "~/board/schema";

const e2ePreviewHost = "preview.sidequest.invalid";

function resolvePreview(
  url: URL,
): Effect.Effect<Attachment, LinkPreviewError, HttpClient.HttpClient> {
  if (env.E2E_MODE === "1" && url.hostname === e2ePreviewHost) {
    const attachment: Attachment = {
      href: url.href,
      id: crypto.randomUUID(),
      label: "E2E link preview",
      mark: "E2",
      meta: "Local deterministic preview",
      type: "link",
    };
    return Effect.succeed(attachment);
  }

  return resolveLinkPreview(url);
}

export const attachmentsForTitle = Effect.fn("attachmentsForTitle")(function* (title: string) {
  const startedAt = Date.now();
  const urls = yield* extractHttpUrls(title);
  yield* Effect.annotateCurrentSpan({ urlCount: urls.length });
  const attachments = yield* Effect.forEach(
    urls,
    (url) => resolvePreview(url).pipe(Effect.catch(() => Effect.succeed(fallbackAttachment(url)))),
    { concurrency: 3 },
  );
  yield* Effect.logInfo("link-preview.lifecycle").pipe(
    Effect.annotateLogs({
      attachmentCount: attachments.length,
      component: "sync-server",
      durationMs: Date.now() - startedAt,
      event: "preview_resolution_finished",
      outcome: "success",
      urlCount: urls.length,
    }),
  );
  return attachments;
});
