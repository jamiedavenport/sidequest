import {
  addHotkeys,
  addLaneHotkeys,
  completeHotkeys,
  editHotkeys,
  inboxHotkeys,
  moveAcrossHotkeys,
  moveLaneHotkeys,
  moveTaskHotkeys,
  navigateHotkeys,
  nestHotkeys,
  notesHotkeys,
  removeLaneHotkeys,
  renameLaneHotkeys,
  ShortcutKeys,
  todayHotkeys,
} from "~/board/components/shortcut-keys.tsrx";

export function ShortcutFooter() @{
  <footer className="hidden items-center gap-4 border-t border-border bg-background/90 px-4 text-[0.625rem] text-muted-foreground sm:flex">
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={navigateHotkeys} />
      Navigate
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={addHotkeys} />
      Create
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={addLaneHotkeys} />
      Lane
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={renameLaneHotkeys} />
      Rename
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={completeHotkeys} />
      Complete
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={editHotkeys} />
      Edit
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={notesHotkeys} />
      Notes
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={nestHotkeys} />
      Nest
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={moveTaskHotkeys} />
      Move
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={moveAcrossHotkeys} />
      Move across
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={moveLaneHotkeys} />
      Move lane
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={removeLaneHotkeys} />
      Remove lane
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={inboxHotkeys} />
      Inbox
    </span>
    <span className="flex items-center gap-1">
      <ShortcutKeys hotkeys={todayHotkeys} />
      Today
    </span>
  </footer>;
}
