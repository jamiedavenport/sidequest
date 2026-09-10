import { TaskComposerControls } from "~/board/components/tasks/composer/controls.tsrx";
import { useAttachmentDraft } from "~/board/attachments/use-attachment-draft";
import { AttachmentDraftList } from "~/board/components/tasks/attachments/draft-list.tsrx";
// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";
import { useComposerHotkeys } from "~/board/components/tasks/composer/use-hotkeys";
import { Check, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { formatTaskDate, parseTaskDate } from "~/board/date";
import { updateTask } from "~/board/data/mutations";
import { useBoardStore } from "~/board/navigation/provider.tsrx";
import { BoardEvent } from "~/board/navigation/model";
import { taskFormSchema } from "~/board/schema";
import { useBoardClient } from "~/board/sync/client.tsrx";
import type { Task } from "~/board/types";
import { Field, FieldError, FieldLabel } from "~/components/ui/field.tsrx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "~/components/ui/input-group.tsrx";

function focusTask(laneId: string, taskId: string) {
  requestAnimationFrame(() => {
    document
      .getElementById(`task-${laneId}-${taskId}`)
      ?.querySelector<HTMLButtonElement>("[data-task-select]")
      ?.focus({ preventScroll: true });
  });
}

export function TaskEdit({ laneId, task }: { laneId: string; task: Task }) @{
  const store = useBoardStore();
  const client = useBoardClient();
  const attachments = useAttachmentDraft(task.id, task.attachments);
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
      if (!attachments.ready) {
        return;
      }
      updateTask(client, task.id, {
        title: value.title,
        attachments: attachments.attachments,
        date: value.date === undefined ? undefined : formatTaskDate(value.date),
      });
      attachments.reset(true);
      store.send(BoardEvent.EditSave({}));
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
    attachments.reset();
    store.send(BoardEvent.EditCancel({}));
    focusTask(laneId, task.id);
  }

  useComposerHotkeys({
    mode: "edit",
    calendarOpen,
    setCalendarOpen,
    titleRef,
    onSubmit: () => form.handleSubmit(),
    onCancel: cancel,
  });

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
          <InputGroup className="@container/task-composer bg-card">
            <InputGroupTextarea
              ref={titleRef}
              className="text-base/6 sm:text-[0.8125rem]/4.25"
              aria-describedby={isInvalid ? `edit-${task.id}-title-error` : undefined}
              aria-invalid={isInvalid}
              id={`edit-${task.id}-title`}
              name={titleField.name}
              onPaste={attachments.paste}
              onBlur={titleField.handleBlur}
              onChange={(event) => titleField.handleChange(event.target.value)}
              rows={3}
              value={titleField.state.value}
            />
            <AttachmentDraftList draft={attachments} />
            <InputGroupAddon align="block-end" className="justify-between border-t">
              <form.Field name="date">
                {(dateField) => @{
                  <TaskComposerControls
                    draft={attachments}
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
                  disabled={!attachments.ready}
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
