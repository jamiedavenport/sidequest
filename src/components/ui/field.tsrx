// oxlint-disable jsx-a11y/prefer-tag-over-role
import { cva, type VariantProps } from "class-variance-authority";
import { useMemo, type ComponentProps, type ReactNode } from "react";

import { Label } from "@/components/ui/label.tsrx";
import { Separator } from "@/components/ui/separator.tsrx";
import { cn } from "@/lib/utils";

export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) @{
  <fieldset
    className={cn(
      "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
      className,
    )}
    data-slot="field-set"
    {...props}
  />;
}

export function FieldLegend({
  className,
  variant = "legend",
  ...props
}: ComponentProps<"legend"> & { variant?: "legend" | "label" }) @{
  <legend
    className={cn(
      "mb-2 font-medium data-[variant=label]:text-base/6 data-[variant=legend]:text-lg sm:data-[variant=label]:text-sm/5 sm:data-[variant=legend]:text-base",
      className,
    )}
    data-slot="field-legend"
    data-variant={variant}
    {...props}
  />;
}

export function FieldGroup({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "group/field-group @container/field-group flex w-full flex-col gap-4 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
      className,
    )}
    data-slot="field-group"
    {...props}
  />;
}

const fieldVariants = cva("group/field flex w-full gap-2 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
      horizontal:
        "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      responsive:
        "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

export function Field({
  className,
  orientation = "vertical",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof fieldVariants>) @{
  <div
    className={cn(fieldVariants({ orientation }), className)}
    data-orientation={orientation}
    data-slot="field"
    role="group"
    {...props}
  />;
}

export function FieldContent({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn("group/field-content flex min-w-0 flex-1 flex-col gap-0.5 leading-5", className)}
    data-slot="field-content"
    {...props}
  />;
}

export function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) @{
  <Label
    className={cn(
      "group/field-label peer/field-label flex w-fit gap-2 leading-5 group-data-[disabled=true]/field:opacity-50 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-input/40 has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:ring-2 has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring/30 *:data-[slot=field]:p-2 dark:has-data-checked:bg-primary/10",
      className,
    )}
    data-slot="field-label"
    {...props}
  />;
}

export function FieldTitle({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "flex w-fit items-center gap-2 text-base/6 font-medium group-data-[disabled=true]/field:opacity-50 sm:text-sm/5",
      className,
    )}
    data-slot="field-label"
    {...props}
  />;
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) @{
  <p
    className={cn(
      "text-left text-base/6 font-normal text-pretty text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5 last:mt-0 nth-last-2:-mt-1 [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary sm:text-sm/5",
      className,
    )}
    data-slot="field-description"
    {...props}
  />;
}

export function FieldSeparator({
  children,
  className,
  ...props
}: ComponentProps<"div"> & { children?: ReactNode }) @{
  <div
    className={cn(
      "relative -my-2 h-5 text-base/6 group-data-[variant=outline]/field-group:-mb-2 sm:text-sm/5",
      className,
    )}
    data-content={Boolean(children)}
    data-slot="field-separator"
    {...props}
  >
    <Separator className="absolute inset-0 top-1/2" />
    @if (children) {
      <span
        className="relative mx-auto w-fit bg-background px-2 text-muted-foreground"
        data-slot="field-separator-content"
      >
        {children}
      </span>;
    }
  </div>;
}

export function FieldError({
  className,
  children,
  errors,
  ...props
}: ComponentProps<"div"> & {
  errors?: ReadonlyArray<{ message?: string } | undefined>;
}) @{
  const uniqueErrors = useMemo(
    () => [...new Map(errors?.map((error) => [error?.message, error]) ?? []).values()],
    [errors],
  );

  if (!children && uniqueErrors.length === 0) {
    return null;
  }

  <div
    className={cn("text-base/6 font-normal text-destructive sm:text-sm/5", className)}
    data-slot="field-error"
    role="alert"
    {...props}
  >
    @if (children) {
      <>{children}</>;
    } @else if (uniqueErrors.length === 1) {
      <>{uniqueErrors[0]?.message}</>;
    } @else {
      <ul className="flex list-disc flex-col gap-1 pl-5">
        @for (const error of uniqueErrors; index index; key `${error?.message}-${index}`) {
          @if (error?.message) {
            <li>{error.message}</li>;
          }
        }
      </ul>;
    }
  </div>;
}
