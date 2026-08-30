import logoUrl from "~/assets/logo.svg?url";
import { Spinner } from "~/components/ui/spinner.tsrx";

export function BoardBooting() @{
  <main
    className="grid h-dvh min-w-80 place-items-center bg-background"
    aria-busy="true"
    aria-live="polite"
  >
    <div className="flex flex-col items-center gap-5">
      <img
        alt="Sidequest"
        className="h-4 w-auto dark:invert"
        height={16}
        src={logoUrl}
        width={76}
      />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        Booting up
      </p>
    </div>
  </main>;
}
