// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useEffect, useRef, useState } from "react";
import type { Selection } from "~/board/navigation/model";
import { viewIdOf } from "~/board/navigation/model";
import type { BoardLane, Task } from "~/board/types";
import { filterCommands, getContextGroup, getSearchResults } from "~/board/commands/results";
import { getSettingsActions } from "~/board/commands/settings";
import { Command, CommandEmpty, CommandInput, CommandList } from "~/components/ui/command.tsrx";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "~/components/ui/dialog.tsrx";
import { useLaneChrome } from "../lane-chrome.tsrx";
import { CommandResults } from "./results.tsrx";
import { useCommandCalendar } from "./use-calendar";
import { useCommandExecution } from "./use-command";

type CommandMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDismiss: () => void;
  selection: Selection;
  lanes: readonly BoardLane[];
  tasks: readonly Task[];
  userId: string;
};

function useCommandGroups(
  lanes: readonly BoardLane[],
  tasks: readonly Task[],
  selection: Selection,
  query: string,
  calendar: ReturnType<typeof useCommandCalendar>["settings"],
) {
  const { githubConnections } = useLaneChrome();
  const lane = lanes.find((item) => item.id === viewIdOf(selection));
  const connected = githubConnections.some((connection) => connection.laneId === lane?.id);
  const search = getSearchResults(lanes, tasks, selection);
  const context = getContextGroup(selection, lanes, tasks);
  return [
    ...(context ? [{ id: "context", ...context }] : []),
    { id: "tasks", heading: "Tasks", results: query.trim() ? search.tasks : [] },
    { id: "lanes", heading: "Lanes", results: search.lanes },
    { id: "settings", heading: "Settings", results: getSettingsActions(lane, connected, calendar) },
  ].map((group) => ({
    ...group,
    results: filterCommands(group.results, query, group.id === "context" ? group.heading : ""),
  }));
}

export function CommandMenu(props: CommandMenuProps) @{
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const calendar = useCommandCalendar(props.open, props.userId);
  const execution = useCommandExecution(
    props.onOpenChange,
    props.onDismiss,
    calendar.changeCalendar,
  );
  const groups = useCommandGroups(
    props.lanes,
    props.tasks,
    props.selection,
    query,
    calendar.settings,
  );
  const firstId = groups.flatMap((group) => group.results)[0]?.id ?? "";
  useEffect(() => {
    if (props.open) {
      setQuery("");
      setSelected("");
    }
  }, [props.open]);
  useEffect(() => {
    setSelected(firstId);
  }, [firstId, query]);

  <Dialog
    open={props.open}
    onOpenChange={(open) => {
      if (!execution.pending) {
        props.onOpenChange(open);
      }
    }}
  >
    <DialogContent
      className="top-[15dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg motion-reduce:animate-none"
      showCloseButton={false}
      initialFocus={inputRef}
      finalFocus={execution.finalFocus}
    >
      <DialogTitle className="sr-only">Search and commands</DialogTitle>
      <DialogDescription className="sr-only">
        Search all lanes and incomplete tasks, or run an action.
      </DialogDescription>
      <Command
        shouldFilter={false}
        value={selected}
        onValueChange={setSelected}
        aria-busy={execution.pending}
      >
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder="Search tasks, lanes, and actions…"
          aria-label="Search tasks, lanes, and actions"
          readOnly={execution.pending}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          @for (const group of groups; key group.id) {
            <CommandResults
              heading={group.heading}
              results={group.results}
              pending={execution.pending}
              onSelect={execution.selectCommand}
            />;
          }
        </CommandList>
        <CommandStatus
          pending={execution.pending}
          loadingCalendar={calendar.loading}
          error={execution.error ?? calendar.error}
        />
      </Command>
    </DialogContent>
  </Dialog>;
}

function CommandStatus({
  pending,
  loadingCalendar,
  error,
}: {
  pending: boolean;
  loadingCalendar: boolean;
  error: string | null;
}) @{
  <>
    @if (pending) {
      <output className="px-3 py-2 text-muted-foreground">Working…</output>;
    }
    @if (loadingCalendar) {
      <output className="px-3 py-2 text-muted-foreground">Loading Calendar settings…</output>;
    }
    @if (error) {
      <p role="alert" className="px-3 py-2 text-destructive">
        {error}
      </p>;
    }
  </>;
}
