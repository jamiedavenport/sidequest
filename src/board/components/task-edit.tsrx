// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { Calendar as CalendarIcon, Check, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { formatTaskDate, parseTaskDate } from "~/board/date";
import { updateTask } from "~/board/data/mutations";
import { BoardActor } from "~/board/navigation/machine";
import { taskFormSchema } from "~/board/schema";
import { saveHotkey } from "~/board/components/shortcut-keys.tsrx";
import { useBoardClient } from "~/board/sync/client";
import type { Task } from "~/board/types";
import { Button } from "~/components/ui/button.tsrx";
import { Calendar } from "~/components/ui/calendar.tsrx";
import { Field, FieldError, FieldLabel } from "~/components/ui/field.tsrx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "~/components/ui/input-group.tsrx";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover.tsrx";

function focusTask(laneId: string, taskId: string) {
  requestAnimationFrame(() => {
    document
      .getElementById(`task-${laneId}-${taskId}`)
      ?.querySelector<HTMLButtonElement>("[data-task-select]")
      ?.focus({ preventScroll: true });
  });
}

function TaskDatePicker({
  calendarOpen,
  onChange,
  setCalendarOpen,
  titleRef,
  value,
}: {
  calendarOpen: boolean;
  onChange: (value: Date | undefined) => void;
  setCalendarOpen: (open: boolean) => void;
  titleRef: RefObject<HTMLTextAreaElement | null>;
  value: Date | undefined;
}) @{
  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
    <PopoverTrigger
      render={<InputGroupButton type="button" variant="ghost" />}
      aria-label={
        value === undefined ? "Pick a due date" : `Change due date, ${formatTaskDate(value)}`
      }
    >
      <CalendarIcon
        className={value === undefined ? undefined : "text-primary"}
        aria-hidden="true"
      />
      {value === undefined ? "No due date" : formatTaskDate(value)}
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
  </Popover>;
}

export function TaskEdit({ laneId, task }: { laneId: string; task: Task }) @{
  const actorRef = BoardActor.useActorRef();
  const client = useBoardClient();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [initialValues] = useState(() => ({
    title: task.title,
    date: parseTaskDate(task.date),
  }));
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: taskFormSchema,
    },
    onSubmit: ({ value }) => {
      updateTask(client, task.id, {
        title: value.title,
        date: value.date === undefined ? undefined : formatTaskDate(value.date),
      });
      actorRef.send({ type: "edit.save" });
      focusTask(laneId, task.id);
    },
  });

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  function cancel() {
    actorRef.send({ type: "edit.cancel" });
    focusTask(laneId, task.id);
  }

  useHotkeys([
    {
      hotkey: saveHotkey,
      callback: () => {
        void form.handleSubmit();
      },
      options: {
        enabled: !calendarOpen,
        ignoreInputs: false,
        meta: { name: "Save task" },
      },
    },
    {
      hotkey: "/",
      callback: () => {
        setCalendarOpen(true);
      },
      options: {
        enabled: !calendarOpen,
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

        cancel();
      },
      options: { ignoreInputs: false, meta: { name: "Cancel edit" } },
    },
  ]);

  <form
    className="pointer-events-auto min-w-0 flex-1 select-text"
    onSubmit={(event) => {
      event.preventDefault();
      event.stopPropagation();
      void form.handleSubmit();
    }}
  >
    <form.Field name="title">
      {(titleField) => @{
        const isInvalid = titleField.state.meta.isTouched && !titleField.state.meta.isValid;

        <Field className="gap-0" data-invalid={isInvalid}>
          <FieldLabel className="sr-only" htmlFor={`edit-${task.id}-title`}>
            Task title
          </FieldLabel>
          <InputGroup className="bg-card">
            <InputGroupTextarea
              ref={titleRef}
              className="text-base/6 sm:text-[0.8125rem]/4.25"
              aria-describedby={isInvalid ? `edit-${task.id}-title-error` : undefined}
              aria-invalid={isInvalid}
              id={`edit-${task.id}-title`}
              name={titleField.name}
              onBlur={titleField.handleBlur}
              onChange={(event) => titleField.handleChange(event.target.value)}
              rows={3}
              value={titleField.state.value}
            />
            <InputGroupAddon align="block-end" className="justify-between border-t">
              <form.Field name="date">
                {(dateField) => @{
                  <TaskDatePicker
                    calendarOpen={calendarOpen}
                    onChange={dateField.handleChange}
                    setCalendarOpen={setCalendarOpen}
                    titleRef={titleRef}
                    value={dateField.state.value}
                  />;
                }}
              </form.Field>
              <div className="flex items-center gap-1">
                <InputGroupButton
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                  aria-label="Cancel editing task"
                  title="Cancel"
                  onClick={cancel}
                >
                  <X aria-hidden="true" />
                </InputGroupButton>
                <InputGroupButton
                  size="icon-xs"
                  type="submit"
                  variant="default"
                  aria-label="Save task"
                  title="Save"
                >
                  <Check aria-hidden="true" />
                </InputGroupButton>
              </div>
            </InputGroupAddon>
          </InputGroup>
          @if (isInvalid) {
            <FieldError
              className="sr-only"
              errors={titleField.state.meta.errors}
              id={`edit-${task.id}-title-error`}
            />;
          }
        </Field>;
      }}
    </form.Field>
  </form>;
}
