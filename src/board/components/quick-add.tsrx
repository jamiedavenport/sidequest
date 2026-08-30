// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { useHotkeys } from "@tanstack/react-hotkeys";
import { Calendar as CalendarIcon, Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { useOptionalBoardClient } from "~/board/sync/client";
import { formatTaskDate } from "~/board/date";
import { BoardActor } from "~/board/navigation/machine";
import { addTask } from "~/board/data/mutations";
import { todayLaneId } from "~/board/views";
import { saveHotkeys, ShortcutKeys } from "~/board/components/shortcut-keys.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import { Calendar } from "~/components/ui/calendar.tsrx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group.tsrx";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover.tsrx";
import type { BoardLane } from "~/board/types";
import { cn } from "@/lib/utils";

export function QuickAdd({ className, lane }: { className?: string; lane: BoardLane }) @{
  const actorRef = BoardActor.useActorRef();
  const client = useOptionalBoardClient();
  const adding = BoardActor.useSelector((snapshot) => snapshot.context.addingLaneId === lane.id);
  const titleRef = useRef<HTMLInputElement>(null);
  const [dueDate, setDueDate] = useState<Date>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  useLayoutEffect(() => {
    if (adding) {
      titleRef.current?.focus();
      return;
    }

    setCalendarOpen(false);
  }, [adding]);

  function resetDate() {
    setDueDate(undefined);
    setCalendarOpen(false);
  }

  function submitAdd() {
    const title = titleRef.current?.value ?? "";
    const id = crypto.randomUUID();
    if (client !== null) {
      addTask(client, {
        id,
        laneId: lane.id,
        title,
        date: dueDate === undefined ? undefined : formatTaskDate(dueDate),
      });
    }
    if (title.trim() !== "" && titleRef.current !== null) {
      actorRef.send({ type: "task.select", taskId: id });
      titleRef.current.value = "";
      resetDate();
    }
  }

  function focusAdd() {
    actorRef.send({ type: "add.start", laneId: lane.id });
  }

  function onSelectDate(next: Date | undefined) {
    setDueDate(next);
    setCalendarOpen(false);
    titleRef.current?.focus();
  }

  useHotkeys(
    adding
      ? [
          {
            hotkey: "Enter",
            callback: submitAdd,
            options: {
              enabled: !calendarOpen,
              ignoreInputs: false,
              target: titleRef,
              meta: { name: "Add task" },
            },
          },
          {
            hotkey: "/",
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

              actorRef.send({ type: "add.cancel" });
              resetDate();
              titleRef.current?.blur();
            },
            options: { meta: { name: "Cancel add" } },
          },
        ]
      : [],
  );

  <InputGroup className={cn("mt-auto h-9 bg-card sm:h-7 sm:bg-input/20", className)}>
    <InputGroupInput
      ref={titleRef}
      name={`add-${lane.id}`}
      placeholder={lane.id === todayLaneId ? "Add to Today" : "Add a task"}
      type="text"
      aria-label={`Add a task to ${lane.title}`}
      onFocus={focusAdd}
    />
    <InputGroupAddon>
      <Plus aria-hidden="true" />
    </InputGroupAddon>
    <InputGroupAddon align="inline-end">
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger
          render={<Button size="icon-xs" type="button" variant="ghost" />}
          aria-label={`Pick a due date for ${lane.title}`}
        >
          <CalendarIcon className={dueDate === undefined ? undefined : "text-primary"} />
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="end"
          initialFocus={false}
          finalFocus={titleRef}
        >
          <Calendar
            mode="single"
            // Focus the selected day (or today) when the user opens the picker.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={calendarOpen}
            defaultMonth={dueDate}
            selected={dueDate}
            onSelect={onSelectDate}
          />
        </PopoverContent>
      </Popover>
      <span className="max-sm:hidden">
        <ShortcutKeys hotkeys={saveHotkeys} />
      </span>
    </InputGroupAddon>
  </InputGroup>;
}
