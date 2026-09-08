// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useConsent } from "@policystack/react/consent";
import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import { useHydrated } from "~/auth/use-hydrated";
import { Button } from "~/components/ui/button.tsrx";
import { Switch } from "~/components/ui/switch.tsrx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet.tsrx";

export function PrivacyNavigation() @{
  const { setRoute } = useConsent();
  <nav
    aria-label="Privacy"
    className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3 text-xs/6 text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-offset-4"
  >
    <Link to="/privacy">Privacy policy</Link>
    <span aria-hidden="true">·</span>
    <Link to="/cookies">Cookie policy</Link>
    <span aria-hidden="true">·</span>
    <button
      className="cursor-pointer underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
      type="button"
      onClick={() => setRoute("preferences")}
    >
      Cookie settings
    </button>
  </nav>;
}

export function PrivacyNotification() @{
  const hydrated = useHydrated();
  const { route, decidedAt, decisions, draft, acceptAll, acceptNecessary, setRoute, toggle, save } =
    useConsent();
  <>
    @if (hydrated && route === "cookie") {
      <section
        aria-labelledby="privacy-choices"
        className="fixed right-4 bottom-4 z-40 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl space-y-4 overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-lg duration-200 ease-out motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 sm:right-6 sm:bottom-6"
      >
        <h2 id="privacy-choices" className="text-base font-semibold">
          Your privacy choices
        </h2>
        <p className="text-sm/6 text-muted-foreground">
          We use necessary cookies and browser storage to keep you signed in and support
          offline use. With your permission, we also use OpenPanel to understand how Sidequest
          is used.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button className="h-10 flex-1" variant="outline" onClick={() => acceptAll()}>
            Allow analytics
          </Button>
          <Button className="h-10 flex-1" variant="outline" onClick={() => acceptNecessary()}>
            Necessary only
          </Button>
          <Button
            aria-label="Settings"
            className="size-10"
            size="icon"
            title="Cookie settings"
            variant="outline"
            onClick={() => setRoute("preferences")}
          >
            <SettingsIcon aria-hidden="true" />
          </Button>
        </div>
        <PrivacyNavigation />
      </section>;
    }
    <Sheet
      open={hydrated && route === "preferences"}
      onOpenChange={(open) => {
        if (!open) {
          setRoute(decidedAt ? "closed" : "cookie");
        }
      }}
    >
      <SheetContent className="overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>Cookie settings</SheetTitle>
          <SheetDescription>
            Choose whether to allow analytics. Your changes apply when you save. Necessary storage
            supports sign-in, security and offline use.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-6">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="necessary-storage">Necessary storage (always on)</label>
            <Switch id="necessary-storage" checked disabled />
          </div>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="analytics-storage">Analytics and performance</label>
            <Switch
              id="analytics-storage"
              checked={(draft ?? decisions).analytics}
              onCheckedChange={() => toggle("analytics")}
            />
          </div>
          <p className="text-sm/6 text-muted-foreground">
            Analytics records visits and browser performance on the board, billing and connections
            pages. Sign-in, payments and offline use work with analytics off.
          </p>
          <PrivacyNavigation />
        </div>
        <SheetFooter>
          <Button className="h-10" onClick={() => save()}>
            Save preferences
          </Button>
          <Button
            className="h-10"
            variant="outline"
            onClick={() => setRoute(decidedAt ? "closed" : "cookie")}
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>;
}
