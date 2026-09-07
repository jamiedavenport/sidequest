import { Effect, Schema } from "effect";
import { expect, it } from "vitest";

import { saveWhiteboard } from "~/board/data/mutations";
import { Whiteboard } from "~/board/schema";
import type { BoardClient } from "~/board/sync/client-types";
import { decodeWhiteboardMutation, decodeWhiteboardSync } from "~/board/sync/codec";
import { readWhiteboardDocument } from "~/board/whiteboard-document";

const legacy = {
  store: {
    "document:document": { id: "document:document", typeName: "document", name: "Old drawing" },
  },
  schema: { schemaVersion: 2, sequences: { "com.tldraw.store": 4 } },
};

it("reads legacy snapshots as blank without changing collection data; unknown documents fail closed", () => {
  const whiteboard = { taskId: "task", document: legacy };
  expect(decodeWhiteboardSync(whiteboard)).toEqual(whiteboard);
  expect(readWhiteboardDocument(legacy)).toEqual({ type: "excalidraw", version: 1, elements: [] });
  for (const document of [
    {},
    { store: {}, schema: {} },
    { type: "excalidraw", version: 2, elements: [] },
    { ...legacy, type: "unknown" },
  ]) {
    expect(Schema.is(Whiteboard)({ taskId: "task", document })).toBe(true);
    expect(() => readWhiteboardDocument(document)).toThrow();
  }
});

it("rejects legacy and asset writes at both mutation boundaries before creating a transaction", () => {
  // No client APIs should be reached when input validation fails.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const client = {} as BoardClient;
  const blank = { type: "excalidraw", version: 1, elements: [] };
  expect(
    Effect.runSync(decodeWhiteboardMutation({ taskId: "task", document: blank })).document,
  ).toEqual(blank);
  for (const document of [
    legacy,
    { ...blank, files: {} },
    { ...blank, appState: {} },
    ...["image", "embeddable", "iframe"].map((type) => ({ ...blank, elements: [{ type }] })),
  ]) {
    const input = { taskId: "task", document };
    expect(Effect.runSync(Effect.flip(decodeWhiteboardMutation(input)))._tag).toBe("SchemaError");
    expect(Effect.runSync(Effect.flip(saveWhiteboard(client, input)))._tag).toBe("SchemaError");
  }
});
