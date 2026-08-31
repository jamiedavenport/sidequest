import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Empty({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance",
      className,
    )}
    data-slot="empty"
    {...props}
  />;
}

export function EmptyHeader({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn("flex max-w-sm flex-col items-center gap-1", className)}
    data-slot="empty-header"
    {...props}
  />;
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function EmptyMedia({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) @{
  <div
    className={cn(emptyMediaVariants({ variant, className }))}
    data-slot="empty-icon"
    data-variant={variant}
    {...props}
  />;
}

export function EmptyTitle({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn("text-sm font-medium tracking-tight", className)}
    data-slot="empty-title"
    {...props}
  />;
}

export function EmptyDescription({ className, ...props }: ComponentProps<"p">) @{
  <p
    className={cn(
      "text-xs/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
      className,
    )}
    data-slot="empty-description"
    {...props}
  />;
}

export function EmptyContent({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "flex w-full max-w-sm min-w-0 flex-col items-center gap-2 text-xs/relaxed text-balance",
      className,
    )}
    data-slot="empty-content"
    {...props}
  />;
}
