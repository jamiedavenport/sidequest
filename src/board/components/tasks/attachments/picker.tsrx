// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useRef, type RefObject } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Paperclip } from "lucide-react";
import type { AttachmentDraft } from "~/board/attachments/use-attachment-draft";
import { mediaAccept } from "~/board/attachments/schema";
import { attachmentHotkey, ShortcutLabel } from "~/board/components/shortcut-keys.tsrx";
import { InputGroupButton } from "~/components/ui/input-group.tsrx";

export function AttachmentPicker({
  draft,
  titleRef,
  enabled = true,
}: {
  draft: AttachmentDraft;
  titleRef: RefObject<HTMLTextAreaElement | null>;
  enabled?: boolean;
}) @{
  const input = useRef<HTMLInputElement>(null);
  useHotkey(attachmentHotkey, () => input.current?.click(), {
    enabled,
    target: titleRef,
    ignoreInputs: false,
    meta: { name: "Attach photos or videos" },
  });
  <>
    <input
      ref={input}
      className="hidden"
      type="file"
      name="attachments"
      aria-label="Choose photos or videos"
      accept={mediaAccept}
      multiple
      onChange={(event) => {
        draft.addFiles(Array.from(event.target.files ?? []));
        event.target.value = "";
        titleRef.current?.focus();
      }}
    />
    <InputGroupButton
      type="button"
      variant="ghost"
      onClick={() => input.current?.click()}
      aria-label="Attach photos or videos"
    >
      <Paperclip aria-hidden="true" />
      <span className="max-sm:sr-only">Attach</span>
      <ShortcutLabel hotkey={attachmentHotkey} />
    </InputGroupButton>
  </>;
}
