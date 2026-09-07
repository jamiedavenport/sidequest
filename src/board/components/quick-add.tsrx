// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { Calendar as CalendarIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { useBoardClient } from "~/board/sync/client.tsrx";
import { isCaretOnFirstLine } from "~/board/caret";
import { formatTaskDate } from "~/board/date";
import { useBoardStore, useBoardSelector } from "~/board/navigation/provider.tsrx";
import { BoardEvent, currentLaneId } from "~/board/navigation/model";
import { addTask } from "~/board/data/mutations";
import { taskFormSchema } from "~/board/schema";
import { dateHotkey, saveHotkey, ShortcutLabel } from "~/board/components/shortcut-keys.tsrx";
import { Calendar } from "~/components/ui/calendar.tsrx";
import { Field, FieldLabel } from "~/components/ui/field.tsrx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "~/components/ui/input-group.tsrx";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover.tsrx";
import type { BoardLane } from "~/board/types";
import { cn } from "@/lib/utils";

export function QuickAdd({ className, lane }: { className?: string; lane: BoardLane }) @{
  const store = useBoardStore();
  const client = useBoardClient();
  const adding = useBoardSelector(
    (snapshot) => snapshot.interaction._tag === "Adding" && currentLaneId(snapshot) === lane.id,
  );
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const label = `Add to ${lane.title}`;
  const formId = `quick-add-${lane.id}`;
  const form = useForm({
    defaultValues: {
      title: "",
      date: undefined as Date | undefined,
    },
    validators: {
      onSubmit: taskFormSchema,
    },
    onSubmit: ({ value }) => {
      const id = crypto.randomUUID();
      addTask(client, {
        id,
        laneId: lane.id,
        title: value.title,
        date: value.date === undefined ? undefined : formatTaskDate(value.date),
      });
      store.send(BoardEvent.TaskCreated({ target: { viewId: lane.id, taskId: id } }));
      form.reset();
    },
  });

  useLayoutEffect(() => {
    if (adding) {
      titleRef.current?.focus();
      return;
    }

    setCalendarOpen(false);
  }, [adding]);

  function focusAdd() {
    store.send(BoardEvent.AddStart({ viewId: lane.id }));
  }

  function cancelAdd() {
    store.send(BoardEvent.AddCancel({}));
    form.reset();
    setCalendarOpen(false);
    titleRef.current?.blur();
  }

  useHotkeys(
    adding
      ? [
          {
            hotkey: "Mod+Enter",
            callback: () => {
              void form.handleSubmit();
            },
            options: {
              enabled: !calendarOpen,
              ignoreInputs: false,
              target: titleRef,
              meta: { name: "Add task" },
            },
          },
          {
            hotkey: "ArrowUp",
            callback: (event) => {
              const title = titleRef.current;
              if (title === null || !isCaretOnFirstLine(title.value, title.selectionStart)) {
                return;
              }

              event.preventDefault();
              store.send(BoardEvent.Navigate({ direction: "up" }));
            },
            options: {
              enabled: !calendarOpen,
              ignoreInputs: false,
              preventDefault: false,
              stopPropagation: false,
              target: titleRef,
              meta: { name: "Navigate up" },
            },
          },
          {
            hotkey: dateHotkey,
            callback: () => {
              setCalendarOpen(true);
            },
            options: {
              ignoreInputs: false,
              target: titleRef,
              meta: { name: "Focus due date" },
            },
          },
          {
            hotkey: "Escape",
            callback: () => {
              if (calendarOpen) {
                setCalendarOpen(false);
                titleRef.current?.focus();
                return;
              }

              cancelAdd();
            },
            options: { meta: { name: "Cancel add" } },
          },
        ]
      : [],
  );

  <form
    className={cn(
      "relative mt-auto before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-8 before:bg-linear-to-b before:from-transparent before:to-white",
      className,
    )}
    id={formId}
    onSubmit={(event) => {
      event.preventDefault();
      void form.handleSubmit();
    }}
  >
    <form.Field name="title">
      {(titleField) => @{
        const isInvalid = titleField.state.meta.isTouched && !titleField.state.meta.isValid;

        <Field data-invalid={isInvalid}>
          <FieldLabel className="sr-only" htmlFor={titleField.name}>
            {label}
          </FieldLabel>
          <InputGroup className="bg-card">
            <InputGroupTextarea
              ref={titleRef}
              aria-describedby={isInvalid ? `${titleField.name}-error` : undefined}
              aria-invalid={isInvalid}
              aria-label={`Add a task to ${lane.title}`}
              id={titleField.name}
              name={titleField.name}
              onBlur={titleField.handleBlur}
              onChange={(event) => titleField.handleChange(event.target.value)}
              onFocus={focusAdd}
              placeholder={label}
              rows={3}
              value={titleField.state.value}
            />
            <InputGroupAddon align="block-end" className="justify-between border-t">
              <form.Field name="date">
                {(dateField) => @{
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger
                      render={<InputGroupButton type="button" variant="ghost" />}
                      aria-label={`Pick a due date for ${lane.title}`}
                    >
                      <CalendarIcon
                        className={dateField.state.value === undefined ? undefined : "text-primary"}
                      />
                      {dateField.state.value === undefined
                        ? "No due date"
                        : formatTaskDate(dateField.state.value)}
                      <ShortcutLabel hotkey={dateHotkey} />
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0"
                      align="start"
                      initialFocus={false}
                      finalFocus={titleRef}
                    >
                      <Calendar
                        mode="single"
                        // Focus the selected day (or today) when the user opens the picker.
                        // oxlint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus={calendarOpen}
                        defaultMonth={dateField.state.value}
                        selected={dateField.state.value}
                        onSelect={(next) => {
                          dateField.handleChange(next);
                          setCalendarOpen(false);
                          titleRef.current?.focus();
                        }}
                      />
                    </PopoverContent>
                  </Popover>;
                }}
              </form.Field>
              <InputGroupButton
                className="px-2 [&_[data-slot=kbd]]:h-4 [&_[data-slot=kbd]]:min-w-4 [&_[data-slot=kbd]]:bg-primary-foreground/15 [&_[data-slot=kbd]]:text-primary-foreground"
                size="sm"
                type="submit"
                variant="default"
              >
                Add
                <ShortcutLabel hotkey={saveHotkey} />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>;
      }}
    </form.Field>
  </form>;
}
