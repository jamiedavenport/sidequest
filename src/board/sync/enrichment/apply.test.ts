import { createCollection, localOnlyCollectionOptions } from "@tanstack/db";
import { expect, it } from "vitest";
import type { Task } from "~/board/schema";
import { applyTaskLinks } from "./apply";

it("does not broadcast stale or duplicate link enrichment and preserves existing media", () => {
  const photo = {
    id: "photo",
    type: "image" as const,
    filename: "photo.png",
    mimeType: "image/png",
    size: 100,
  };
  const link = {
    id: "link",
    type: "link" as const,
    href: "https://example.com/",
    label: "Example",
    mark: "E",
    meta: "Example",
  };
  const task: Task = {
    id: "task",
    title: "Current title",
    completed: false,
    collapsed: false,
    rank: 0,
    attachments: [photo],
  };
  const tasks = createCollection(
    localOnlyCollectionOptions<Task, string>({ getKey: (value) => value.id, initialData: [task] }),
  );
  const stale = { id: task.id, title: "Previous title", attachments: [link] };

  expect(applyTaskLinks(tasks, [stale])).toEqual([]);
  expect(tasks.get(task.id)?.attachments).toEqual([photo]);

  const current = { ...stale, title: task.title };
  const outgoing = applyTaskLinks(tasks, [current]);
  expect(outgoing).toHaveLength(1);
  expect(outgoing[0]?.value).toMatchObject({ attachments: [photo, link] });
  expect(applyTaskLinks(tasks, [current])).toEqual([]);
});
