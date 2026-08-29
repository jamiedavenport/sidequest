import { Plus } from "lucide-react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group.tsrx";
import { Kbd } from "~/components/ui/kbd.tsrx";
import type { Lane } from "~/components/board/types";

export function QuickAdd({ lane }: { lane: Lane }) @{
  <InputGroup className="mt-auto h-9 bg-card sm:h-7 sm:bg-input/20">
    <InputGroupInput
      name={`add-${lane.id}`}
      placeholder={lane.kind === "today" ? "Add to Today" : "Add a task"}
      type="text"
      aria-label={`Add a task to ${lane.title}`}
    />
    <InputGroupAddon>
      <Plus aria-hidden="true" />
    </InputGroupAddon>
    <InputGroupAddon className="max-sm:hidden" align="inline-end">
      <Kbd>Enter</Kbd>
    </InputGroupAddon>
  </InputGroup>;
}
