// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { ArrowRightIcon, CheckIcon, Columns3Icon } from "lucide-react";
import type { CommandResult, CommandTarget } from "~/board/commands/results";
import { CommandGroup, CommandItem } from "~/components/ui/command.tsrx";

export function CommandResults({
  heading,
  results,
  pending,
  onSelect,
}: {
  heading: string;
  results: readonly CommandResult[];
  pending: boolean;
  onSelect: (target: CommandTarget) => void;
}) @{
  @if (results.length > 0) {
    <CommandGroup heading={heading}>
      @for (const result of results; key result.id) {
        <CommandItem
          value={result.id}
          disabled={pending}
          onSelect={() => onSelect(result.target)}
        >
          @if (
            result.target.kind === "task" &&
            result.target.action === "complete"
          ) {
            <CheckIcon aria-hidden="true" />;
          } @else if (
            result.target.kind === "lane" &&
            result.target.action === "focus"
          ) {
            <Columns3Icon aria-hidden="true" />;
          } @else {
            <ArrowRightIcon aria-hidden="true" />;
          }
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{result.label}</span>
            @if (result.description) {
              <span className="text-muted-foreground">{result.description}</span>;
            }
          </span>
        </CommandItem>;
      }
    </CommandGroup>;
  }
}
