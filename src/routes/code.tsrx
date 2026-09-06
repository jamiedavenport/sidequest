// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";

import { continueOAuth } from "~/auth/connections";
import { authClient } from "~/auth/client";
import { AuthShell } from "~/auth/components/auth-shell.tsrx";
import { sendSignInCode } from "~/auth/middleware";
import { verificationCodeFormSchema } from "~/auth/schema";
import { Button } from "~/components/ui/button.tsrx";
import { Field, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field.tsrx";
import { Input } from "~/components/ui/input.tsrx";

const RESEND_COOLDOWN_SECONDS = 30;

function verificationErrorMessage(code: string | undefined): string {
  switch (code) {
    case "OTP_EXPIRED":
      return "That code has expired. Request a new code and try again.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many incorrect attempts. Request a new code to continue.";
    case "INVALID_OTP":
      return "That code is invalid. Check the six digits and try again.";
    default:
      return "We couldn’t verify that code. Please try again.";
  }
}

export function Component({ email, oauthQuery }: { email: string; oauthQuery?: string }) @{
  const navigate = useNavigate();
  const loginSearch = useMemo(() => ({ oauthQuery }), [oauthQuery]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const form = useForm({
    defaultValues: {
      code: "",
    },
    validators: {
      onBlur: verificationCodeFormSchema,
      onSubmit: verificationCodeFormSchema,
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        const { data, error } = await authClient.$fetch<{ url?: string }, { code?: string }>(
          "/sign-in/email-otp",
          {
            method: "POST",
            body: { email, otp: value.code, ...(oauthQuery ? { oauth_query: oauthQuery } : {}) },
          },
        );
        if (error !== null) {
          setSubmitError(verificationErrorMessage(error.code));
          return;
        }

        if (oauthQuery) {
          window.location.assign(data?.url ?? (await continueOAuth({ data: { oauthQuery } })));
          return;
        }
        await navigate({ to: "/" });
      } catch {
        setSubmitError("We couldn’t verify that code. Check your connection and try again.");
      }
    },
  });

  useEffect(() => {
    if (cooldown === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resendCode() {
    if (isResending || cooldown > 0) {
      return;
    }

    setIsResending(true);
    setResendError(null);
    try {
      const sent = await sendSignInCode({ data: { email } });
      if (!sent) {
        setResendError("We couldn’t send a new code. Please try again.");
        return;
      }

      setCooldown(RESEND_COOLDOWN_SECONDS);
      setSubmitError(null);
      form.reset();
    } catch {
      setResendError("We couldn’t send a new code. Check your connection and try again.");
    } finally {
      setIsResending(false);
    }
  }

  <AuthShell
    description={
      <>
        We sent a six-digit code to <strong className="font-medium text-foreground">{email}</strong>
        .
      </>
    }
    title="Enter your code"
  >
    <form
      aria-describedby={submitError === null ? undefined : "verification-error"}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.Field name="code">
          {(field) => @{
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Verification code</FieldLabel>
              <Input
                aria-describedby={isInvalid ? `${field.name}-error` : undefined}
                aria-invalid={isInvalid}
                autoComplete="one-time-code"
                className="h-11 bg-white px-3 text-center text-lg tracking-[0.3em] tabular-nums placeholder:tracking-[0.3em] sm:h-9 sm:text-base"
                id={field.name}
                inputMode="numeric"
                maxLength={6}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value.replace(/\D/g, ""))}
                pattern="[0-9]*"
                placeholder="000000"
                required
                type="text"
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
        <p className="text-sm/5 text-destructive" id="verification-error" role="alert">
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
            {isSubmitting ? "Verifying…" : "Verify"}
          </Button>;
        }}
      </form.Subscribe>
    </form>

    <div className="flex flex-col gap-3 text-base/6 text-muted-foreground sm:text-sm/5">
      <p>
        Didn’t receive it?{" "}
        <Button
          className="h-auto p-0 text-base/6 sm:text-sm/5"
          disabled={isResending || cooldown > 0}
          onClick={resendCode}
          type="button"
          variant="link"
        >
          {isResending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
      </p>
      @if (resendError !== null) {
        <p className="text-sm/5 text-destructive" role="alert">
          {resendError}
        </p>;
      }
      <Link
        className="w-fit font-medium text-foreground underline-offset-4 hover:underline"
        to="/login"
        search={loginSearch}
      >
        Use a different email
      </Link>
    </div>
  </AuthShell>;
}
