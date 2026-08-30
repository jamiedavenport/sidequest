import type { ComponentProps } from "react";
import { Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

export function Spinner({ className, ...props }: ComponentProps<"svg">) @{
  <Loader2Icon
    data-slot="spinner"
    aria-hidden="true"
    className={cn("size-4 animate-spin", className)}
    {...props}
  />;
}
