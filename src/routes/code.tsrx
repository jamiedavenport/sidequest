// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";

import { AuthShell } from "~/auth/components/auth-shell.tsrx";
import { verificationCodeFormSchema } from "~/auth/schema";
import { Button } from "~/components/ui/button.tsrx";
import { Field, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field.tsrx";
import { Input } from "~/components/ui/input.tsrx";

export function Component({ email }: { email?: string }) @{
  const destination = email ?? "your email address";
  const form = useForm({
    defaultValues: {
      code: "",
    },
    validators: {
      onBlur: verificationCodeFormSchema,
      onSubmit: verificationCodeFormSchema,
    },
    onSubmit: ({ value }) => {
      console.log("Verification code submitted", { ...value, email });
    },
  });

  function resendCode() {
    console.log("Verification code resend requested", { email });
  }

  <AuthShell
    description={
      <>
        We sent a six-digit code to{" "}
        <strong className="font-medium text-foreground">{destination}</strong>.
      </>
    }
    title="Enter your code"
  >
    <form
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

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => @{
          <Button
            className="h-11 w-full text-base/6 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 sm:h-9 sm:text-sm/6"
            disabled={!canSubmit}
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
          onClick={resendCode}
          type="button"
          variant="link"
        >
          Resend code
        </Button>
      </p>
      <Link
        className="w-fit font-medium text-foreground underline-offset-4 hover:underline"
        to="/login"
      >
        Use a different email
      </Link>
    </div>
  </AuthShell>;
}
