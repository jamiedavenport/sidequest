// oxlint-disable react-perf/jsx-no-new-function-as-prop
import { useForm } from "@tanstack/react-form";

import { AuthShell } from "~/auth/components/auth-shell.tsrx";
import { loginFormSchema } from "~/auth/schema";
import { Button } from "~/components/ui/button.tsrx";
import { Field, FieldError, FieldGroup, FieldLabel } from "~/components/ui/field.tsrx";
import { Input } from "~/components/ui/input.tsrx";

export function Component() @{
  const form = useForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onBlur: loginFormSchema,
      onSubmit: loginFormSchema,
    },
    onSubmit: ({ value }) => {
      console.log("Login submitted", value);
    },
  });

  <AuthShell description={<>Enter your email and we’ll send you a sign-in code.</>} title="Sign in">
    <form
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

      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => @{
          <Button
            className="h-11 w-full text-base/6 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 sm:h-9 sm:text-sm/6"
            disabled={!canSubmit}
            type="submit"
          >
            {isSubmitting ? "Sending…" : "Continue"}
          </Button>;
        }}
      </form.Subscribe>
    </form>
  </AuthShell>;
}
