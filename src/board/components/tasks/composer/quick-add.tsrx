import { TaskComposerControls } from "~/board/components/tasks/composer/controls.tsrx";
import { useAttachmentDraft } from "~/board/attachments/use-attachment-draft";
import { AttachmentDraftList } from "~/board/components/tasks/attachments/draft-list.tsrx";
// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";
import { useComposerHotkeys } from "~/board/components/tasks/composer/use-hotkeys";
import { useLayoutEffect, useRef, useState } from "react";

import { useBoardClient } from "~/board/sync/client.tsrx";
import { formatTaskDate } from "~/board/date";
import { useBoardStore, useBoardSelector } from "~/board/navigation/provider.tsrx";
import { BoardEvent, currentLaneId } from "~/board/navigation/model";
import { addTask } from "~/board/data/mutations";
import { taskFormSchema } from "~/board/schema";
import { saveHotkey, ShortcutLabel } from "~/board/components/shortcut-keys.tsrx";
import { Field, FieldLabel } from "~/components/ui/field.tsrx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "~/components/ui/input-group.tsrx";
import type { BoardLane } from "~/board/types";
import { cn } from "@/lib/utils";

export function QuickAdd({ className, lane }: { className?: string; lane: BoardLane }) @{
  const store = useBoardStore();
  const client = useBoardClient();
  const adding = useBoardSelector(
    (snapshot) => snapshot.interaction._tag === "Adding" && currentLaneId(snapshot) === lane.id,
  );
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [taskId, setTaskId] = useState(() => crypto.randomUUID());
  const attachments = useAttachmentDraft(taskId);
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
      if (!attachments.ready) {
        return;
      }
      const id = taskId;
      addTask(client, {
        id,
        laneId: lane.id,
        title: value.title,
        attachments: attachments.attachments,
        date: value.date === undefined ? undefined : formatTaskDate(value.date),
      });
      store.send(BoardEvent.TaskCreated({ target: { viewId: lane.id, taskId: id } }));
      attachments.reset(true);
      setTaskId(crypto.randomUUID());
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
    attachments.reset();
    setTaskId(crypto.randomUUID());
    form.reset();
    setCalendarOpen(false);
    titleRef.current?.blur();
  }

  useComposerHotkeys({
    mode: "add",
    enabled: adding,
    calendarOpen,
    setCalendarOpen,
    titleRef,
    onSubmit: () => form.handleSubmit(),
    onCancel: cancelAdd,
    onNavigateUp: () => store.send(BoardEvent.Navigate({ direction: "up" })),
  });

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
          <InputGroup className="@container/task-composer bg-card">
            <InputGroupTextarea
              ref={titleRef}
              aria-describedby={isInvalid ? `${titleField.name}-error` : undefined}
              aria-invalid={isInvalid}
              aria-label={`Add a task to ${lane.title}`}
              id={titleField.name}
              name={titleField.name}
              onPaste={attachments.paste}
              onBlur={titleField.handleBlur}
              onChange={(event) => titleField.handleChange(event.target.value)}
              onFocus={focusAdd}
              placeholder={label}
              rows={3}
              value={titleField.state.value}
            />
            <AttachmentDraftList draft={attachments} />
            <InputGroupAddon align="block-end" className="justify-between border-t">
              <form.Field name="date">
                {(dateField) => @{
                  <TaskComposerControls
                    draft={attachments}
                    enabled={adding}
                    dateLabel={`Pick a due date for ${lane.title}`}
                    calendarOpen={calendarOpen}
                    onChange={dateField.handleChange}
                    setCalendarOpen={setCalendarOpen}
                    titleRef={titleRef}
                    value={dateField.state.value}
                  />;
                }}
              </form.Field>
              <InputGroupButton
                className="px-2 [&_[data-slot=kbd]]:h-4 [&_[data-slot=kbd]]:min-w-4 [&_[data-slot=kbd]]:bg-primary-foreground/15 [&_[data-slot=kbd]]:text-primary-foreground"
                size="sm"
                disabled={!attachments.ready}
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
