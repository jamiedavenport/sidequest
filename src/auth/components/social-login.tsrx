// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { authClient } from "~/auth/client";
import { getSocialProviders } from "~/auth/social";
import { Button } from "~/components/ui/button.tsrx";
import { FieldSeparator } from "~/components/ui/field.tsrx";
import { GitHubIcon } from "~/github/icon.tsrx";
import { GoogleIcon } from "~/google/icon.tsrx";

class SocialLoginError extends Schema.TaggedError<SocialLoginError>()("SocialLoginError", {}) {}

export function SocialLogin({
  oauthQuery,
  onError,
}: {
  oauthQuery: string | undefined;
  onError: (message: string | null) => void;
}) @{
  const [providers, setProviders] = useState({ github: false, google: false });
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void Effect.runPromise(
      Effect.tryPromise({
        try: () => getSocialProviders(),
        catch: () => new SocialLoginError(),
      }).pipe(
        Effect.tap((available) => Effect.sync(() => setProviders(available))),
        Effect.ignore,
      ),
    );
    if (new URLSearchParams(window.location.search).has("error")) {
      onError("Sign-in was cancelled or could not be completed. Please try again.");
    }
  }, [onError]);
  const signIn = Effect.fn("signInWithSocialProvider")(
    function* (provider: "github" | "google") {
      setBusy(provider);
      onError(null);
      const continuation = oauthQuery ? `/login?${new URLSearchParams({ oauthQuery })}` : "/";
      const result = yield* Effect.tryPromise({
        try: () =>
          authClient.signIn.social({
            provider,
            callbackURL: continuation,
            errorCallbackURL: oauthQuery ? continuation : "/login",
          }),
        catch: () => new SocialLoginError(),
      });
      if (result.error) {
        return yield* new SocialLoginError();
      }
    },
    Effect.catch(() =>
      Effect.sync(() => onError("Sign-in could not be started. Please try again.")),
    ),
    Effect.ensuring(Effect.sync(() => setBusy(null))),
  );

  <>
    @if (providers.github || providers.google) {
      <FieldSeparator className="text-center text-xs sm:text-xs">
        or continue with
      </FieldSeparator>;
    }
    @if (providers.google) {
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full gap-2 text-sm"
        disabled={busy !== null}
        onClick={() => Effect.runPromise(signIn("google"))}
      >
        <GoogleIcon />
        {busy === "google" ? "Connecting…" : "Continue with Google"}
      </Button>;
    }
    @if (providers.github) {
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full gap-2 text-sm"
        disabled={busy !== null}
        onClick={() => Effect.runPromise(signIn("github"))}
      >
        <GitHubIcon />
        {busy === "github" ? "Connecting…" : "Continue with GitHub"}
      </Button>;
    }
  </>;
}
