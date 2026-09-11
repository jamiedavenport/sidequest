// oxlint-disable react-perf/jsx-no-new-function-as-prop
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useBoardStore } from "~/board/navigation/provider.tsrx";
import { BoardEvent } from "~/board/navigation/model";
import type { BoardLane } from "~/board/types";

export function StartAddButton({
  lane,
  className,
  ...props
}: ComponentProps<"button"> & { lane: BoardLane }) @{
  const store = useBoardStore();

  function onStartAdd(event: { button: number; preventDefault: () => void }) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    store.send(BoardEvent.AddStart({ viewId: lane.id }));
  }

  <button
    className={cn("text-left", className)}
    type="button"
    aria-label={`Add a task to ${lane.title}`}
    {...props}
    onClick={onStartAdd}
  />;
}
