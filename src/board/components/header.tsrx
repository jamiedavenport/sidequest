import { Ellipsis } from "lucide-react";

import { ShortcutLabel } from "~/board/components/shortcut-keys.tsrx";
import { Button } from "~/components/ui/button.tsrx";

function SearchGlyph() @{
  <span
    className="relative size-3.5 shrink-0 rounded-full border-2 border-muted-foreground after:absolute after:-right-1 after:-bottom-0.5 after:h-0.5 after:w-1.5 after:rotate-45 after:rounded-full after:bg-muted-foreground"
    aria-hidden="true"
  />;
}

export function AppHeader() @{
  <header className="relative z-10 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-3.5 backdrop-blur-xl sm:px-4.5">
    <a
      className="flex w-fit items-center gap-2.5 text-base font-semibold tracking-tight text-foreground no-underline sm:text-sm"
      href="/"
      aria-label="Homepage"
    >
      <span>Sidequest</span>
    </a>

    <div className="flex items-center justify-end gap-2">
      <Button type="button" variant="outline" aria-label="Search or run a command">
        <span className="sm:hidden">
          <SearchGlyph />
        </span>
        <span className="hidden sm:inline">Search</span>
        <ShortcutLabel hotkey="Mod+K" />
      </Button>
      <Button size="icon" type="button" variant="ghost" aria-label="More options">
        <Ellipsis aria-hidden="true" />
      </Button>
    </div>
  </header>;
}
