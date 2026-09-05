// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { Extension, InputRule, type Editor, type JSONContent } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@tiptap/extension-heading";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import { useLiveQuery } from "@tanstack/react-db";
import { Effect } from "effect";
import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type { EditorSaveStatus } from "~/board/components/editor-save-status";
import { saveNote } from "~/board/data/mutations";
import { emptyNoteDocument, isAllowedNoteHref, type NoteDocument } from "~/board/schema";
import { useBoardClient } from "~/board/sync/client";

const markdownLinkPattern = /\[([^\[\]]+)\]\(([^\s()]+)\)$/;

function editorContent(content: NoteDocument): JSONContent {
  // Tiptap's JSON type is mutable, while validated Effect Schema values are readonly.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return structuredClone(content) as JSONContent;
}

function normalizeNoteHref(input: string): string | null {
  const value = input.trim();
  if (value === "") {
    return null;
  }

  const href = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  return isAllowedNoteHref(href) ? href : null;
}

export const MarkdownLinkShortcut = Extension.create({
  name: "markdownLinkShortcut",
  addKeyboardShortcuts() {
    return {
      "Mod-k": () => {
        setEditorLink(this.editor);
        return true;
      },
    };
  },
  addInputRules() {
    return [
      new InputRule({
        find: markdownLinkPattern,
        handler: ({ state, range, match }) => {
          const label = match[1];
          const href = match[2] === undefined ? null : normalizeNoteHref(match[2]);
          const link = state.schema.marks.link;
          if (label === undefined || href === null || link === undefined) {
            return null;
          }

          state.tr
            .replaceWith(range.from, range.to, state.schema.text(label, [link.create({ href })]))
            .setMeta("preventAutolink", true);
        },
      }),
    ];
  },
});

function setEditorLink(editor: Editor) {
  const current = editor.getAttributes("link").href;
  const input = window.prompt("Link URL", typeof current === "string" ? current : "");
  if (input === null) {
    return;
  }

  if (input.trim() === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }

  const href = normalizeNoteHref(input);
  if (href === null) {
    return;
  }

  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

export function NoteEditor({
  taskId,
  onStatusChange,
}: {
  taskId: string;
  onStatusChange: (status: EditorSaveStatus) => void;
}) @{
  const client = useBoardClient();
  const notesQuery = useLiveQuery((query) => query.from({ note: client.notes }));
  const note = notesQuery.data?.find((candidate) => candidate.taskId === taskId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const saveAfterCurrentRef = useRef(false);
  const revisionRef = useRef(0);
  const latestContentRef = useRef<JSONContent>(editorContent(note?.content ?? emptyNoteDocument()));
  const mountedRef = useRef(true);
  const flushRef = useRef<() => void>(() => undefined);

  const editor = useEditor({
    immediatelyRender: false,
    content: editorContent(note?.content ?? emptyNoteDocument()),
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({ levels: [1, 2] }),
      BulletList,
      OrderedList,
      ListItem,
      Link.configure({
        autolink: true,
        linkOnPaste: true,
        openOnClick: false,
        defaultProtocol: "https",
        HTMLAttributes: {
          rel: "noopener noreferrer",
        },
        isAllowedUri: (url) => normalizeNoteHref(url) !== null,
      }),
      MarkdownLinkShortcut,
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-full px-4 py-3 text-sm/6 outline-none [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-6",
        "data-note-editor": "",
      },
    },
    onUpdate: ({ editor: current }) => {
      latestContentRef.current = current.getJSON();
      revisionRef.current += 1;
      dirtyRef.current = true;
      onStatusChange("dirty");
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => flushRef.current(), 400);
    },
  });

  const flush = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (!dirtyRef.current) {
      return;
    }
    if (savingRef.current) {
      saveAfterCurrentRef.current = true;
      return;
    }

    const task = client.tasks.get(taskId);
    if (task === undefined || task.completed) {
      dirtyRef.current = false;
      return;
    }

    const revision = revisionRef.current;
    const content = latestContentRef.current;
    savingRef.current = true;
    saveAfterCurrentRef.current = false;
    if (mountedRef.current) {
      onStatusChange("saving");
    }

    void Effect.runPromise(saveNote(client, { taskId, content })).then(
      () => {
        savingRef.current = false;
        if (revision === revisionRef.current && !saveAfterCurrentRef.current) {
          dirtyRef.current = false;
          if (mountedRef.current) {
            onStatusChange("saved");
          }
          return;
        }
        flushRef.current();
      },
      () => {
        savingRef.current = false;
        if (mountedRef.current) {
          onStatusChange("error");
        }
      },
    );
  }, [client, onStatusChange, taskId]);
  flushRef.current = flush;

  useEffect(() => {
    if (editor === null || note === undefined) {
      return;
    }

    const incoming = JSON.stringify(note.content);
    const current = JSON.stringify(editor.getJSON());
    if (incoming === current) {
      return;
    }

    if (dirtyRef.current || savingRef.current) {
      latestContentRef.current = editor.getJSON();
      revisionRef.current += 1;
      dirtyRef.current = true;
      flushRef.current();
      return;
    }

    const content = editorContent(note.content);
    latestContentRef.current = content;
    editor.commands.setContent(content, { emitUpdate: false });
    onStatusChange("saved");
  }, [editor, note, onStatusChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flushRef.current();
    };
  }, []);

  <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
    <EditorContent
      className={cn(
        "min-h-0 flex-1 overflow-y-auto bg-background",
        editor === null && "opacity-50",
      )}
      editor={editor}
    />
  </div>;
}
