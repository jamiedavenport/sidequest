import { Schema } from "effect";

export class LinkPreviewError extends Schema.TaggedError<LinkPreviewError>()("LinkPreviewError", {
  url: Schema.String,
  reason: Schema.Literals(["blocked", "http", "parse"]),
  cause: Schema.optionalKey(Schema.Defect()),
}) {}
