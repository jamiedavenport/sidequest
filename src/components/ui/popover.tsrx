import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Popover({ ...props }: PopoverPrimitive.Root.Props) @{
  <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) @{
  <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) @{
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Positioner
      className="isolate z-50"
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
    >
      <PopoverPrimitive.Popup
        className={cn(
          "z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-lg bg-popover p-2.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        data-slot="popover-content"
        {...props}
      />
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>;
}

export function PopoverHeader({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn("flex flex-col gap-1 text-xs", className)}
    data-slot="popover-header"
    {...props}
  />;
}

export function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) @{
  <PopoverPrimitive.Title
    className={cn("text-sm font-medium", className)}
    data-slot="popover-title"
    {...props}
  />;
}

export function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) @{
  <PopoverPrimitive.Description
    className={cn("text-muted-foreground", className)}
    data-slot="popover-description"
    {...props}
  />;
}
