import { Effect } from "effect";
import { fromGithubPromise, GitHubError } from "~/github/schema";
import { authClient } from "~/auth/client";
import { isGithubEnabled } from "~/github/functions";
import { GitHubIcon } from "~/github/icon.tsrx";
import { oauthQueryFromSearch } from "~/auth/oauth-continuation";
// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PrivacyNavigation } from "~/privacy/consent.tsrx";
import { LoginShell } from "~/auth/components/login-shell.tsrx";
import { sendSignInCode } from "~/auth/middleware";
import { loginFormSchema } from "~/auth/schema";
import { Button } from "~/components/ui/button.tsrx";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "~/components/ui/field.tsrx";
import { Input } from "~/components/ui/input.tsrx";

export function Component() @{
  const navigate = useNavigate();
  const oauthQuery = oauthQueryFromSearch(useLocation().searchStr);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [githubAvailable, setGithubAvailable] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);
  useEffect(() => {
    void Effect.runPromise(
      fromGithubPromise(() => isGithubEnabled()).pipe(
        Effect.tap((enabled) => Effect.sync(() => setGithubAvailable(enabled))),
        Effect.ignore,
      ),
    );
    if (new URLSearchParams(window.location.search).has("error")) {
      setSubmitError("GitHub sign-in was cancelled or could not be completed. Please try again.");
    }
  }, []);

  const signInWithGithub = Effect.fn("signInWithGithub")(
    function* () {
      setGithubBusy(true);
      setSubmitError(null);
      const continuation = oauthQuery ? `/login?${new URLSearchParams({ oauthQuery })}` : "/";
      const result = yield* fromGithubPromise(() =>
        authClient.signIn.social({
          provider: "github",
          callbackURL: continuation,
          errorCallbackURL: oauthQuery ? continuation : "/login",
        }),
      );
      if (result.error) {
        return yield* new GitHubError({ message: "GitHub sign-in could not be started." });
      }
    },
    Effect.catch(() =>
      Effect.sync(() => setSubmitError("GitHub sign-in could not be started. Please try again.")),
    ),
    Effect.ensuring(Effect.sync(() => setGithubBusy(false))),
  );

  const form = useForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onBlur: loginFormSchema,
      onSubmit: loginFormSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const email = value.email.trim().toLowerCase();
      try {
        const sent = await sendSignInCode({ data: { email } });
        if (!sent) {
          setSubmitError("We couldn’t send a sign-in code. Please try again.");
          return;
        }

        await navigate({ search: { email, oauthQuery }, to: "/code" });
      } catch {
        setSubmitError("We couldn’t send a sign-in code. Check your connection and try again.");
      }
    },
  });

  <LoginShell>
    <form
      aria-describedby={submitError === null ? undefined : "login-error"}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="email">
          {(field) => @{
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            <Field data-invalid={isInvalid}>
              <FieldLabel className="text-xs/4" htmlFor={field.name}>
                Email address
              </FieldLabel>
              <Input
                aria-describedby={isInvalid ? `${field.name}-error` : undefined}
                aria-invalid={isInvalid}
                autoComplete="email"
                className="h-9 bg-white px-3"
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={field.state.value}
              />
              @if (isInvalid) {
                <FieldError errors={field.state.meta.errors} id={`${field.name}-error`} />;
              }
            </Field>;
          }}
        </form.Field>
      </FieldGroup>

      @if (submitError !== null) {
        <p className="text-sm/5 text-destructive" id="login-error" role="alert">
          {submitError}
        </p>;
      }

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => @{
          <Button
            className="h-9 w-full text-sm/6 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
            disabled={!canSubmit || isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Sending…" : "Continue"}
          </Button>;
        }}
      </form.Subscribe>
    </form>
    @if (githubAvailable) {
      <>
        <FieldSeparator className="text-center text-xs sm:text-xs">
          or continue with
        </FieldSeparator>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full gap-2 text-sm"
          disabled={githubBusy}
          onClick={() => Effect.runPromise(signInWithGithub())}
        >
          <GitHubIcon />
          {githubBusy ? "Connecting…" : "Continue with GitHub"}
        </Button>
      </>;
    }
    <PrivacyNavigation />
  </LoginShell>;
}
