import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

import { Separator } from "~/components/ui/separator.tsrx";

export function ItemGroup({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2",
      className,
    )}
    data-slot="item-group"
    {...props}
  />;
}

export function ItemSeparator({ className, ...props }: ComponentProps<typeof Separator>) @{
  <Separator
    className={cn("my-2", className)}
    data-slot="item-separator"
    orientation="horizontal"
    {...props}
  />;
}

const itemVariants = cva(
  "group/item flex w-full flex-wrap items-center rounded-md border text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:hover:bg-muted",
  {
    variants: {
      variant: {
        default: "border-transparent",
        outline: "border-border",
        muted: "border-transparent bg-muted/50",
      },
      size: {
        default: "gap-2.5 px-3 py-2.5",
        sm: "gap-2.5 px-3 py-2.5",
        xs: "gap-2.5 px-2.5 py-2 in-data-[slot=dropdown-menu-content]:p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Item({
  children,
  className,
  variant = "default",
  size = "default",
  href,
  rel,
  target,
  ...props
}: HTMLAttributes<HTMLElement> &
  VariantProps<typeof itemVariants> &
  Pick<ComponentProps<"a">, "href" | "rel" | "target">) @{
  const itemClassName = cn(itemVariants({ variant, size, className }));

  @if (href !== undefined) {
    <a
      className={itemClassName}
      data-size={size}
      data-slot="item"
      data-variant={variant}
      href={href}
      rel={rel}
      target={target}
      {...props}
    >
      {children}
    </a>;
  } @else {
    <div
      className={itemClassName}
      data-size={size}
      data-slot="item"
      data-variant={variant}
      {...props}
    >
      {children}
    </div>;
  }
}

const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "[&_svg:not([class*='size-'])]:size-4",
        image:
          "size-8 overflow-hidden rounded-sm group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function ItemMedia({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>) @{
  <div
    className={cn(itemMediaVariants({ variant, className }))}
    data-slot="item-media"
    data-variant={variant}
    {...props}
  />;
}

export function ItemContent({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "flex min-w-0 flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0.5 [&+[data-slot=item-content]]:flex-none",
      className,
    )}
    data-slot="item-content"
    {...props}
  />;
}

export function ItemTitle({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "line-clamp-1 flex w-fit items-center gap-2 text-xs/relaxed font-medium underline-offset-4",
      className,
    )}
    data-slot="item-title"
    {...props}
  />;
}

export function ItemDescription({ className, ...props }: ComponentProps<"p">) @{
  <p
    className={cn(
      "line-clamp-2 text-left text-xs/relaxed font-normal text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
      className,
    )}
    data-slot="item-description"
    {...props}
  />;
}

export function ItemActions({ className, ...props }: ComponentProps<"div">) @{
  <div className={cn("flex items-center gap-2", className)} data-slot="item-actions" {...props} />;
}

export function ItemHeader({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn("flex basis-full items-center justify-between gap-2", className)}
    data-slot="item-header"
    {...props}
  />;
}

export function ItemFooter({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn("flex basis-full items-center justify-between gap-2", className)}
    data-slot="item-footer"
    {...props}
  />;
}
