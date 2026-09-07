// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useEffect, useState } from "react";

import { useLaneChrome } from "~/board/components/lane-chrome.tsrx";
import { deleteLane } from "~/board/data/mutations";
import { useBoardClient } from "~/board/sync/client.tsrx";
import type { BoardLane } from "~/board/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog.tsrx";
import { Label } from "~/components/ui/label.tsrx";
import { Switch } from "~/components/ui/switch.tsrx";

export function LaneRemoveDialog({ lanes }: { lanes: ReadonlyArray<BoardLane> }) @{
  const client = useBoardClient();
  const { removingLaneId, stopRemove } = useLaneChrome();
  const [deleteTasks, setDeleteTasks] = useState(false);
  const lane = lanes.find((candidate) => candidate.id === removingLaneId);
  const open = lane !== undefined;
  const description = deleteTasks
    ? "Tasks in this lane will be permanently deleted."
    : "Tasks move to Inbox, or stay in Today if they are due today.";

  useEffect(() => {
    if (open) {
      setDeleteTasks(false);
    }
  }, [open, removingLaneId]);

  function onOpenChange(next: boolean) {
    if (!next) {
      stopRemove();
    }
  }

  function onConfirm() {
    if (lane === undefined) {
      return;
    }

    deleteLane(client, lane.id, { deleteTasks });
    stopRemove();
  }

  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove {lane?.title}?</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="delete-lane-tasks">Delete tasks in this lane</Label>
        <Switch id="delete-lane-tasks" checked={deleteTasks} onCheckedChange={setDeleteTasks} />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Remove lane
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
