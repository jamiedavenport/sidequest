import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium outline-none disabled:pointer-events-none disabled:opacity-45 sm:text-sm [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        destructive:
          "bg-destructive-soft text-destructive hover:bg-destructive-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        outline:
          "bg-background text-foreground ring-1 ring-border hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      },
      size: {
        default: "h-9 px-3",
        icon: "size-9",
        sm: "h-7 px-2.5",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
);

export type ButtonProps = ComponentProps<typeof ButtonPrimitive> &
  VariantProps<typeof buttonVariants>;

export function Button({ children, className, size, variant, ...props }: ButtonProps) @{
  <ButtonPrimitive
    className={cn(buttonVariants({ className, size, variant }))}
    data-slot="button"
    {...props}
  >
    @if (size === "icon") {
      <span
        className="pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        aria-hidden="true"
      />;
    }
    {children}
  </ButtonPrimitive>;
}
