// oxlint-disable jsx-a11y/label-has-associated-control
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<"label">) @{
  <label
    className={cn(
      "flex items-center gap-2 text-base/6 font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 sm:text-sm/5",
      className,
    )}
    data-slot="label"
    {...props}
  />;
}
