import { useEffect } from "react";
import { useAttachmentDraft } from "~/board/attachments/use-attachment-draft";
import { updateTask } from "~/board/data/mutations";
import { currentLaneId, selectedTaskId } from "~/board/navigation/model";
import { useBoardStore } from "~/board/navigation/provider.tsrx";
import { useBoardClient } from "~/board/sync/client.tsrx";
import { AttachmentDraftList } from "~/board/components/tasks/attachments/draft-list.tsrx";

export function TaskPasteAttachments({
  taskId,
  laneId,
}: {
  taskId: string;
  laneId: string;
}) @{
  const client = useBoardClient();
  const store = useBoardStore();
  const draft = useAttachmentDraft(taskId, [], (attachment) => {
    const task = client.tasks.get(taskId);
    if (!task || task.completed) {
      return;
    }
    updateTask(client, taskId, {
      title: task.title,
      date: task.date,
      attachments: [...(task.attachments ?? []), attachment],
    });
  });

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      const snapshot = store.getSnapshot();
      const target = event.target;
      if (
        snapshot.interaction._tag !== "Navigating" ||
        selectedTaskId(snapshot) !== taskId ||
        currentLaneId(snapshot) !== laneId ||
        !event.clipboardData ||
        event.defaultPrevented ||
        !(target instanceof Element) ||
        target.closest("input, textarea, [contenteditable], [role=dialog], [role=alertdialog]")
      ) {
        return;
      }
      const task = client.tasks.get(taskId);
      if (task && !task.completed) {
        draft.paste(
          {
            clipboardData: event.clipboardData,
            preventDefault: () => event.preventDefault(),
            stopPropagation: () => event.stopPropagation(),
          },
          task.attachments,
        );
      }
    }
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [client, store, draft, taskId, laneId]);

  <div className="pointer-events-auto">
    <AttachmentDraftList draft={draft} pendingOnly />
  </div>;
}
