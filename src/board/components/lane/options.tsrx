// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { Ellipsis } from "lucide-react";
import { useBoardClient } from "~/board/sync/client.tsrx";
import { useBoardStore } from "~/board/navigation/provider.tsrx";
import { BoardEvent } from "~/board/navigation/model";
import { moveLane, requestRemoveLane } from "~/board/data/mutations";
import { planLaneMove } from "~/board/views";
import type { BoardLane } from "~/board/types";
import { Button } from "~/components/ui/button.tsrx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu.tsrx";
import { GitHubIcon } from "~/github/icon.tsrx";
import { useBoardDrag } from "../board-drag.tsrx";
import { useLaneChrome } from "../lane-chrome.tsrx";
import {
  moveLaneLeftHotkeys,
  moveLaneRightHotkeys,
  removeLaneHotkeys,
  renameLaneHotkeys,
  ShortcutKeys,
} from "../shortcut-keys.tsrx";

export function LaneOptions({ lane }: { lane: BoardLane }) @{
  const client = useBoardClient();
  const store = useBoardStore();
  const { startRename, startRemove, openGithubSettings } = useLaneChrome();
  const { runMove } = useBoardDrag();
  const canMoveLeft = planLaneMove(client.lanes.toArray, lane.id, "left") !== undefined;
  const canMoveRight = planLaneMove(client.lanes.toArray, lane.id, "right") !== undefined;

  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <Button size="icon" type="button" variant="ghost" aria-label={`${lane.title} options`} />
      }
    >
      <Ellipsis aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-48">
      <DropdownMenuItem
        onClick={() => {
          store.send(BoardEvent.EditCancel({}));
          startRename(lane.id);
        }}
      >
        Rename
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={renameLaneHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!canMoveLeft}
        onClick={() => {
          store.send(BoardEvent.EditCancel({}));
          runMove(moveLane(client, lane.id, "left"));
        }}
      >
        Move left
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={moveLaneLeftHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!canMoveRight}
        onClick={() => {
          store.send(BoardEvent.EditCancel({}));
          runMove(moveLane(client, lane.id, "right"));
        }}
      >
        Move right
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={moveLaneRightHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => openGithubSettings(lane.id)}>
        <GitHubIcon />
        GitHub
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={() => {
          store.send(BoardEvent.EditCancel({}));
          requestRemoveLane(client, lane.id, startRemove);
        }}
      >
        Remove lane
        <DropdownMenuShortcut>
          <ShortcutKeys hotkeys={removeLaneHotkeys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
