import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border border-transparent px-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-muted-foreground",
        today: "bg-primary/10 text-primary",
        outline: "border-border bg-card text-muted-foreground",
        ghost: "text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({
  className,
  variant = "secondary",
  render,
  ...props
}: BadgeProps) @{
  const renderedBadge = useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });

  <>{renderedBadge}</>;
}
