// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useHotkey } from "@tanstack/react-hotkeys";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";

import { BoardActor } from "~/board/machine";
import { enterHotkeys, ShortcutKeys } from "~/board/components/shortcut-keys.tsrx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group.tsrx";
import type { Lane } from "~/board/types";

export function QuickAdd({ lane }: { lane: Lane }) @{
  const actorRef = BoardActor.useActorRef();
  const adding = BoardActor.useSelector((snapshot) => snapshot.context.addingLaneId === lane.id);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) {
      inputRef.current?.focus();
    }
  }, [adding]);

  useHotkey(
    "Enter",
    () => {
      const title = inputRef.current?.value ?? "";
      actorRef.send({ type: "add.submit", title, id: crypto.randomUUID() });
      if (title.trim() !== "" && inputRef.current !== null) {
        inputRef.current.value = "";
      }
    },
    { enabled: adding, ignoreInputs: false, meta: { name: "Add task" } },
  );
  useHotkey(
    "Escape",
    () => {
      actorRef.send({ type: "add.cancel" });
      inputRef.current?.blur();
    },
    { enabled: adding, meta: { name: "Cancel add" } },
  );

  function focusAdd() {
    actorRef.send({ type: "add.start", laneId: lane.id });
  }

  <InputGroup className="mt-auto h-9 bg-card sm:h-7 sm:bg-input/20">
    <InputGroupInput
      ref={inputRef}
      name={`add-${lane.id}`}
      placeholder={lane.kind === "today" ? "Add to Today" : "Add a task"}
      type="text"
      aria-label={`Add a task to ${lane.title}`}
      onFocus={focusAdd}
    />
    <InputGroupAddon>
      <Plus aria-hidden="true" />
    </InputGroupAddon>
    <InputGroupAddon className="max-sm:hidden" align="inline-end">
      <ShortcutKeys hotkeys={enterHotkeys} />
    </InputGroupAddon>
  </InputGroup>;
}
