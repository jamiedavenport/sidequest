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
import { SettingsIcon, CreditCardIcon, PlugIcon, MenuIcon, LogOutIcon } from "lucide-react";
import logoUrl from "~/assets/logo.svg?url";
import logoDarkUrl from "~/assets/logo-dark.svg?url";
import { authClient } from "~/auth/client";
import { Button, buttonVariants } from "~/components/ui/button.tsrx";

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
        className="h-5 w-auto dark:hidden"
        height={104}
        src={logoUrl}
        width={435}
      />
      <img
        alt="Sidequest"
        className="h-5 w-auto not-dark:hidden"
        height={104}
        src={logoDarkUrl}
        width={435}
      />
    </a>

    <div className="flex items-center justify-end gap-2">
      @if (signOutError !== null) {
        <p className="text-xs text-destructive" role="alert">
          {signOutError}
        </p>;
      }
      <Link
        to="/settings"
        aria-label="Settings"
        title="Settings"
        className={buttonVariants({
          variant: "ghost",
          size: "icon",
          className: "text-muted-foreground",
        })}
      >
        <SettingsIcon aria-hidden="true" />
      </Link>
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
