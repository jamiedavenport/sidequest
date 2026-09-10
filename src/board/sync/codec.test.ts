import { planTaskCreate } from "~/board/data/task-planning";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { decodeTaskMutation } from "~/board/sync/codec";
import type { Task } from "~/board/types";

const existing: Task = {
  id: "task",
  title: "Task",
  rank: 0,
  completed: false,
  collapsed: true,
};

describe("decodeTaskMutation", () => {
  it("preserves collapse state when a legacy update omits the property", () => {
    const decoded = Effect.runSync(
      decodeTaskMutation(
        {
          id: "task",
          title: "Updated task",
          rank: 0,
          completed: false,
        },
        existing,
      ),
    );

    expect(decoded.collapsed).toBe(true);
  });

  it("accepts an explicit collapse value from a current client", () => {
    const decoded = Effect.runSync(decodeTaskMutation({ ...existing, collapsed: false }, existing));

    expect(decoded.collapsed).toBe(false);
  });
});

it("preserves server-owned GitHub identity through offline title edits and rejects forged identities", () => {
  const attachment = {
    id: "github-1",
    type: "github-issue" as const,
    issueId: 1,
    repositoryId: 2,
    number: 3,
    repository: "owner/repo",
    title: "Original issue",
    href: "https://github.com/owner/repo/issues/3",
  };
  const linked = { ...existing, attachments: [attachment] };
  const edited = Effect.runSync(
    decodeTaskMutation({ ...existing, title: "Local title", attachments: [] }, linked),
  );
  expect(edited.attachments).toEqual([attachment]);
  const legacy = Effect.runSync(decodeTaskMutation({ ...existing, title: "Offline edit" }, linked));
  expect(legacy.attachments).toEqual([attachment]);
  const forged = { ...attachment, issueId: 99, href: "https://github.com/other/repo/issues/99" };
  expect(
    Effect.runSync(decodeTaskMutation({ ...existing, attachments: [forged] }, linked)).attachments,
  ).toEqual([attachment]);
  expect(
    Effect.runSync(decodeTaskMutation({ ...existing, attachments: [forged] })).attachments,
  ).toEqual([]);
});

it("preserves manual attachments on legacy replay and applies only known removals", () => {
  const photo = {
    id: "photo",
    type: "image" as const,
    filename: "photo.png",
    mimeType: "image/png",
    size: 100,
  };
  const link = {
    id: "manual",
    type: "link" as const,
    source: "manual" as const,
    href: "https://example.com/",
    label: "Example",
    meta: "Example",
    mark: "E",
  };
  const task = { ...existing, attachments: [photo, link] };
  expect(
    Effect.runSync(decodeTaskMutation({ ...existing, attachments: [] }, task, [])).attachments,
  ).toEqual([photo, link]);
  expect(
    Effect.runSync(decodeTaskMutation({ ...existing, attachments: [] }, task, [photo.id]))
      .attachments,
  ).toEqual([link]);
  expect(
    Effect.runSync(decodeTaskMutation(task, existing, [photo.id, link.id])).attachments,
  ).toEqual([]);
});

it("accepts tasks planned for MCP without attachments before JSON serialization", () => {
  const planned = planTaskCreate([], { id: "mcp-task", viewId: "inbox", title: "Task" });
  expect(planned).not.toHaveProperty("attachments");
  expect(Effect.runSync(decodeTaskMutation(planned))).toMatchObject({
    id: "mcp-task",
    title: "Task",
  });
});
