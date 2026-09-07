// oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop
import { Link } from "@tanstack/react-router";
import { useConsent } from "@policystack/react/consent";
import { Effect, Schema } from "effect";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu.tsrx";
import { CreditCardIcon, PlugIcon, MenuIcon, LogOutIcon } from "lucide-react";
import logoUrl from "~/assets/logo.svg?url";
import { ShortcutLabel } from "~/board/components/shortcut-keys.tsrx";
import { authClient } from "~/auth/client";
import { Button, buttonVariants } from "~/components/ui/button.tsrx";

function SearchGlyph() @{
  <span
    className="relative size-3.5 shrink-0 rounded-full border-2 border-muted-foreground after:absolute after:-right-1 after:-bottom-0.5 after:h-0.5 after:w-1.5 after:rotate-45 after:rounded-full after:bg-muted-foreground"
    aria-hidden="true"
  />;
}

class SignOutError extends Schema.TaggedError<SignOutError>()("SignOutError", {
  cause: Schema.Defect(),
}) {}

export function AppHeader() @{
  const { setRoute } = useConsent();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOut = Effect.fn("signOut")(
    function* () {
      setSigningOut(true);
      setSignOutError(null);
      const result = yield* Effect.tryPromise({
        try: () => authClient.signOut(),
        catch: (cause) => new SignOutError({ cause }),
      });
      if (result.error) {
        return yield* new SignOutError({ cause: result.error });
      }
      window.location.assign("/login");
    },
    Effect.catch(() => Effect.sync(() => setSignOutError("Couldn’t sign out. Please try again."))),
    Effect.ensuring(Effect.sync(() => setSigningOut(false))),
  );

  <header className="relative z-10 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-3.5 backdrop-blur-xl sm:px-4.5">
    <a className="flex h-7 w-fit items-center text-foreground no-underline" href="/">
      <img
        alt="Sidequest"
        className="h-3 w-auto dark:invert"
        height={12}
        src={logoUrl}
        width={57}
      />
    </a>

    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        aria-label="Search or run a command"
        className="w-[160px] justify-between"
      >
        <span className="sm:hidden">
          <SearchGlyph />
        </span>
        <span className="hidden sm:inline">Search</span>
        <ShortcutLabel hotkey="Mod+K" />
      </Button>
      @if (signOutError !== null) {
        <p className="text-xs text-destructive" role="alert">
          {signOutError}
        </p>;
      }
      <a
        href="/billing"
        aria-label="Billing"
        title="Billing"
        className={buttonVariants({
          variant: "ghost",
          size: "icon",
          className: "text-muted-foreground",
        })}
      >
        <CreditCardIcon aria-hidden="true" />
      </a>
      <a
        href="/connections"
        aria-label="Connected apps"
        title="Connected apps"
        className={buttonVariants({
          variant: "ghost",
          size: "icon",
          className: "text-muted-foreground",
        })}
      >
        <PlugIcon aria-hidden="true" />
      </a>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Application menu" />}
        >
          <MenuIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link to="/privacy" />}>Privacy policy</DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/cookies" />}>Cookie policy</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRoute("preferences")}>
            Cookie settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={signingOut} onClick={() => Effect.runPromise(signOut())}>
            <LogOutIcon aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>;
}
