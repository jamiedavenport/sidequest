import type { Attachment } from "~/board/schema";

export function mergeTaskAttachments(
  incoming: ReadonlyArray<Attachment>,
  existing: ReadonlyArray<Attachment>,
  originalIds: ReadonlyArray<string>,
): Attachment[] {
  const original = new Set(originalIds);
  const incomingIds = new Set(incoming.map((attachment) => attachment.id));
  const preserved = existing.filter((attachment) => {
    if (attachment.type === "github-issue") {
      return true;
    }
    if (attachment.type === "link" && attachment.source !== "manual") {
      return false;
    }
    // An offline edit can only delete attachments the client had already seen.
    const deletedByClient = original.has(attachment.id) && !incomingIds.has(attachment.id);
    return !deletedByClient;
  });
  const canonicalById = new Map(preserved.map((attachment) => [attachment.id, attachment]));
  const accepted = incoming.flatMap((attachment) => {
    const canonical = canonicalById.get(attachment.id);
    if (canonical) {
      return [canonical];
    }
    // GitHub identity belongs to the server, never the editing client.
    if (attachment.type === "github-issue") {
      return [];
    }
    if (attachment.type === "link" && attachment.source !== "manual") {
      return [attachment];
    }
    // Previously known attachments missing on the server were deleted elsewhere.
    return original.has(attachment.id) ? [] : [attachment];
  });
  const addedElsewhere = preserved.filter((attachment) => !incomingIds.has(attachment.id));
  return [...accepted, ...addedElsewhere];
}
