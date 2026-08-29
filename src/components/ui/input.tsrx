import { Input as InputPrimitive } from "@base-ui/react/input";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type InputProps = ComponentProps<typeof InputPrimitive>;

export function Input({ className, type, ...props }: InputProps) @{
  <InputPrimitive
    className={cn(
      "h-8 w-full min-w-0 rounded-md border border-input bg-card px-2.5 text-base/6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-7 sm:text-sm/5",
      className,
    )}
    data-slot="input"
    type={type}
    {...props}
  />;
}
