// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button.tsrx";
import { cn } from "~/lib/utils";

export function MediaNavigation({
  index,
  count,
  onNavigate,
  className,
}: {
  index: number;
  count: number;
  onNavigate: (direction: -1 | 1) => void;
  className?: string;
}) @{
  <div className={cn("flex items-center gap-2", className)}>
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      disabled={index === 0}
      aria-label="Previous attachment"
      onClick={() => onNavigate(-1)}
    >
      <ChevronLeft />
    </Button>
    <p className="text-sm tabular-nums">
      {index + 1} / {count}
    </p>
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      disabled={index === count - 1}
      aria-label="Next attachment"
      onClick={() => onNavigate(1)}
    >
      <ChevronRight />
    </Button>
  </div>;
}
