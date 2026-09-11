// oxlint-disable jsx-a11y/no-redundant-roles, react-perf/jsx-no-new-function-as-prop
import type { RefObject } from "react";
import { cn } from "@/lib/utils";
import type { BoardLane } from "~/board/types";
import { isSystemLane } from "~/board/views";
import { useBoardSelector } from "~/board/navigation/provider.tsrx";
import { Button } from "~/components/ui/button.tsrx";
import { GitHubIcon } from "~/github/icon.tsrx";
import { QuickAdd } from "../tasks/composer/quick-add.tsrx";
import { TaskRow } from "../tasks/row.tsrx";
import { useLaneChrome } from "../lane-chrome.tsrx";
import { LaneSymbol } from "./symbol.tsrx";
import { LaneTitle } from "./title.tsrx";
import { LaneOptions } from "./options.tsrx";
import { LanePrivacyToggle } from "./privacy.tsrx";
import { StartAddButton } from "./start-add-button.tsrx";

type LaneContentProps = {
  lane: BoardLane;
  selected: boolean;
  headerRef: RefObject<HTMLDivElement | null>;
};

function LaneHeader({ lane, headerRef }: Pick<LaneContentProps, "lane" | "headerRef">) @{
  const { githubConnections, openGithubSettings } = useLaneChrome();
  const githubConnection = githubConnections.find((connection) => connection.laneId === lane.id);
  const system = isSystemLane(lane);
  <div ref={headerRef} className="flex min-w-0 items-center justify-between gap-3 px-2 sm:px-1">
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <StartAddButton className="shrink-0" lane={lane}>
        <LaneSymbol colour={lane.colour} shape={lane.shape} />
      </StartAddButton>
      <LaneTitle lane={lane} />
    </div>
    <div className="flex shrink-0 items-center gap-1">
      @if (!system && githubConnection) {
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground"
          aria-label={`${lane.title} GitHub settings (${githubConnection.repository})`}
          title={`Connected to ${githubConnection.repository} on GitHub`}
          onClick={() => openGithubSettings(lane.id)}
        >
          <GitHubIcon />
        </Button>;
      }
      <LanePrivacyToggle laneId={lane.id} />
      @if (!system) {
        <LaneOptions lane={lane} />;
      }
    </div>
  </div>;
}

export function LaneContent({ lane, selected, headerRef }: LaneContentProps) @{
  const editingTask = useBoardSelector((snapshot) => snapshot.interaction._tag === "Editing");
  const quickAddActive = selected && !editingTask;
  <>
    <LaneHeader lane={lane} headerRef={headerRef} />
    <div className="flex min-h-0 flex-1 flex-col pt-4 sm:pt-3.5">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2 sm:pb-1.5">
        <ul className="flex flex-col gap-0.5" role="list">
          @for (const task of lane.tasks; key task.id) {
            <TaskRow laneId={lane.id} task={task} />;
          }
        </ul>
        <StartAddButton className="min-h-0 w-full flex-1" lane={lane} />
      </div>
      <div className="relative shrink-0">
        <div
          className={cn(
            "origin-bottom transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            quickAddActive
              ? "scale-100 opacity-100"
              : "pointer-events-none absolute inset-x-0 bottom-0 scale-90 opacity-0 motion-reduce:scale-100",
          )}
          aria-hidden={quickAddActive ? undefined : true}
          inert={quickAddActive ? undefined : true}
        >
          <QuickAdd lane={lane} />
        </div>
        @if (!quickAddActive) {
          <StartAddButton className="absolute inset-0" lane={lane} />;
        }
      </div>
    </div>
  </>;
}
