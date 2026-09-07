import { Option, Schema } from "effect";

const Point = Schema.Tuple([Schema.Number, Schema.Number]);

const Binding = Schema.NullOr(
  Schema.Struct({
    elementId: Schema.String,
    focus: Schema.Number,
    gap: Schema.Number,
    fixedPoint: Schema.optionalKey(Point),
  }),
);

const baseFields = {
  id: Schema.NonEmptyString,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  angle: Schema.Number,
  strokeColor: Schema.String,
  backgroundColor: Schema.String,
  fillStyle: Schema.Literals(["hachure", "cross-hatch", "solid", "zigzag"]),
  strokeWidth: Schema.Number,
  strokeStyle: Schema.Literals(["solid", "dashed", "dotted"]),
  roundness: Schema.NullOr(
    Schema.Struct({ type: Schema.Number, value: Schema.optionalKey(Schema.Number) }),
  ),
  roughness: Schema.Number,
  opacity: Schema.Number,
  seed: Schema.Number,
  version: Schema.Number,
  versionNonce: Schema.Number,
  isDeleted: Schema.Boolean,
  index: Schema.NullOr(Schema.String),
  groupIds: Schema.Array(Schema.String),
  frameId: Schema.NullOr(Schema.String),
  boundElements: Schema.NullOr(
    Schema.Array(Schema.Struct({ id: Schema.String, type: Schema.Literals(["arrow", "text"]) })),
  ),
  updated: Schema.Number,
  link: Schema.NullOr(Schema.String),
  locked: Schema.Boolean,
};

const Arrowhead = Schema.NullOr(
  Schema.Literals([
    "arrow",
    "bar",
    "dot",
    "circle",
    "circle_outline",
    "triangle",
    "triangle_outline",
    "diamond",
    "diamond_outline",
    "crowfoot_one",
    "crowfoot_many",
    "crowfoot_one_or_many",
  ]),
);

const Element = Schema.Union([
  Schema.Struct({ ...baseFields, type: Schema.Literals(["rectangle", "ellipse", "diamond"]) }),
  Schema.Struct({
    ...baseFields,
    type: Schema.Literal("text"),
    text: Schema.String,
    originalText: Schema.String,
    fontSize: Schema.Number,
    fontFamily: Schema.Number,
    lineHeight: Schema.Number,
    textAlign: Schema.Literals(["left", "center", "right"]),
    verticalAlign: Schema.Literals(["top", "middle", "bottom"]),
    containerId: Schema.NullOr(Schema.String),
    autoResize: Schema.Boolean,
  }),
  Schema.Struct({
    ...baseFields,
    type: Schema.Literals(["line", "arrow"]),
    points: Schema.Array(Point),
    lastCommittedPoint: Schema.NullOr(Point),
    startBinding: Binding,
    endBinding: Binding,
    startArrowhead: Arrowhead,
    endArrowhead: Arrowhead,
    elbowed: Schema.optionalKey(Schema.Boolean),
    fixedSegments: Schema.optionalKey(
      Schema.NullOr(
        Schema.Array(Schema.Struct({ start: Point, end: Point, index: Schema.Number })),
      ),
    ),
    startIsSpecial: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
    endIsSpecial: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
  }),
  Schema.Struct({
    ...baseFields,
    type: Schema.Literal("freedraw"),
    points: Schema.Array(Point),
    pressures: Schema.Array(Schema.Number),
    simulatePressure: Schema.Boolean,
    lastCommittedPoint: Schema.NullOr(Point),
  }),
  Schema.Struct({
    ...baseFields,
    type: Schema.Literal("frame"),
    name: Schema.NullOr(Schema.String),
  }),
]);

// Keep Excalidraw's JSON fields intact, but validate their shape without loading
// the browser-only editor in the Worker. Assets and generated HTML are forbidden.
const SceneElement = Schema.JsonObject.check(
  Schema.makeFilter(
    (element) =>
      (Schema.is(Element)(element) &&
        !["fileId", "files", "customData"].some((key) => key in element)) ||
      "Invalid or asset-backed whiteboard element",
  ),
);

export const ExcalidrawDocument = Schema.Struct({
  type: Schema.Literal("excalidraw"),
  version: Schema.Literal(1),
  elements: Schema.Array(SceneElement),
}).check(
  Schema.makeFilter(
    (document) =>
      new Set(document.elements.map((element) => element.id)).size === document.elements.length ||
      "Duplicate whiteboard element IDs",
  ),
);
export type ExcalidrawDocument = typeof ExcalidrawDocument.Type;

export const WhiteboardWrite = Schema.Struct({
  taskId: Schema.String,
  document: ExcalidrawDocument,
});

export const decodeExcalidrawDocument = Schema.decodeUnknownSync(ExcalidrawDocument, {
  onExcessProperty: "error",
});

// Only recognize the TLStoreSnapshot envelope Sidequest previously saved.
const LegacyDocument = Schema.Struct({
  store: Schema.Record(
    Schema.String,
    Schema.JsonObject.check(
      Schema.makeFilter(
        (record) => typeof record.id === "string" && typeof record.typeName === "string",
      ),
    ),
  ),
  schema: Schema.Struct({
    schemaVersion: Schema.Literal(2),
    sequences: Schema.Record(Schema.String, Schema.Int),
  }),
});

export function readWhiteboardDocument(input: unknown): ExcalidrawDocument {
  if (
    input === undefined ||
    Option.isSome(Schema.decodeUnknownOption(LegacyDocument, { onExcessProperty: "error" })(input))
  ) {
    return { type: "excalidraw", version: 1, elements: [] };
  }
  return decodeExcalidrawDocument(input);
}

// Object key order and transient UI state must not turn remote/UI callbacks into edits.
export function getDocumentKey(document: ExcalidrawDocument): string {
  return JSON.stringify(document, (_key, value: unknown) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)),
      );
    }
    return value;
  });
}
