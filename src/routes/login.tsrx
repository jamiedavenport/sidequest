import { oauthQueryFromSearch } from "~/auth/oauth-continuation";
// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useState } from "react";

import { PrivacyNavigation } from "~/privacy/consent.tsrx";
import { AuthShell } from "~/auth/components/auth-shell.tsrx";
import { sendSignInCode } from "~/auth/middleware";
import { loginFormSchema } from "~/auth/schema";
import { Button } from "~/components/ui/button.tsrx";
import { Field, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field.tsrx";
import { Input } from "~/components/ui/input.tsrx";

export function Component() @{
  const navigate = useNavigate();
  const oauthQuery = oauthQueryFromSearch(useLocation().searchStr);
  const [submitError, setSubmitError] = useState<string | null>(null);
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

  <AuthShell description={<>Enter your email and we’ll send you a sign-in code.</>} title="Sign in">
    <form
      aria-describedby={submitError === null ? undefined : "login-error"}
      className="flex flex-col gap-5"
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
              <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
              <Input
                aria-describedby={isInvalid ? `${field.name}-error` : undefined}
                aria-invalid={isInvalid}
                autoComplete="email"
                className="h-11 bg-white px-3 sm:h-9"
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
            className="h-11 w-full text-base/6 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 sm:h-9 sm:text-sm/6"
            disabled={!canSubmit || isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Sending…" : "Continue"}
          </Button>;
        }}
      </form.Subscribe>
    </form>
    <PrivacyNavigation />
  </AuthShell>;
}
