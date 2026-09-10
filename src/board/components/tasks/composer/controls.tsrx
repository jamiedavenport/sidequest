// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useHotkey } from "@tanstack/react-hotkeys";
import { Calendar as CalendarIcon } from "lucide-react";
import type { RefObject } from "react";
import type { AttachmentDraft } from "~/board/attachments/use-attachment-draft";
import { AttachmentPicker } from "~/board/components/tasks/attachments/picker.tsrx";
import { dateHotkey, ShortcutLabel } from "~/board/components/shortcut-keys.tsrx";
import { formatTaskDate } from "~/board/date";
import { Button } from "~/components/ui/button.tsrx";
import { Calendar } from "~/components/ui/calendar.tsrx";
import { InputGroupButton } from "~/components/ui/input-group.tsrx";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover.tsrx";
import { cn } from "~/lib/utils";

export function TaskComposerControls({
  className,
  draft,
  enabled = true,
  dateLabel,
  calendarOpen,
  onChange,
  setCalendarOpen,
  titleRef,
  value,
}: {
  className?: string;
  draft: AttachmentDraft;
  enabled?: boolean;
  dateLabel?: string;
  calendarOpen: boolean;
  onChange: (value: Date | undefined) => void;
  setCalendarOpen: (open: boolean) => void;
  titleRef: RefObject<HTMLTextAreaElement | null>;
  value: Date | undefined;
}) @{
  useHotkey(dateHotkey, () => setCalendarOpen(true), {
    enabled: enabled && !calendarOpen,
    ignoreInputs: false,
    target: titleRef,
    meta: { name: "Focus due date" },
  });

  <div
    className={cn(
      "flex min-w-0 flex-1 flex-wrap items-center gap-1 @max-xs/task-composer:[&_[data-slot=kbd]]:hidden",
      className,
    )}
  >
    <AttachmentPicker draft={draft} titleRef={titleRef} enabled={enabled && !calendarOpen} />
    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
      <PopoverTrigger
        render={<InputGroupButton type="button" variant="ghost" />}
        aria-label={
          dateLabel ??
          (value === undefined ? "Pick a due date" : `Change due date, ${formatTaskDate(value)}`)
        }
      >
        <CalendarIcon
          className={value === undefined ? undefined : "text-primary"}
          aria-hidden="true"
        />
        {value === undefined ? "Date" : formatTaskDate(value)}
        <ShortcutLabel hotkey={dateHotkey} />
      </PopoverTrigger>
      <PopoverContent
        className="w-auto gap-0 p-0"
        align="start"
        initialFocus={false}
        finalFocus={titleRef}
      >
        <Calendar
          mode="single"
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={calendarOpen}
          defaultMonth={value}
          selected={value}
          onSelect={(next) => {
            onChange(next);
            setCalendarOpen(false);
            titleRef.current?.focus();
          }}
        />
        @if (value !== undefined) {
          <div className="flex justify-end border-t border-border/50 p-2">
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                onChange(undefined);
                setCalendarOpen(false);
                titleRef.current?.focus();
              }}
            >
              Clear due date
            </Button>
          </div>;
        }
      </PopoverContent>
    </Popover>
  </div>;
}
