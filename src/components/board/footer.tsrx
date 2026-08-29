import { Kbd, KbdGroup } from "~/components/ui/kbd.tsrx";

export function ShortcutFooter() @{
  <footer className="hidden items-center gap-4 border-t border-border bg-background/90 px-4 text-[0.625rem] text-muted-foreground sm:flex">
    <span className="flex items-center gap-1">
      <KbdGroup>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
      </KbdGroup>
      Navigate
    </span>
    <span className="flex items-center gap-1">
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>↵</Kbd>
      </KbdGroup>
      Complete
    </span>
    <span className="flex items-center gap-1">
      <Kbd>Tab</Kbd> Nest
    </span>
    <span className="flex items-center gap-1">
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>⇧</Kbd>
        <Kbd>←</Kbd>
        <Kbd>→</Kbd>
      </KbdGroup>
      Move lane
    </span>
  </footer>;
}
