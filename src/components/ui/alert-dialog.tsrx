// oxlint-disable react-perf/jsx-no-jsx-as-prop
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { Button } from "~/components/ui/button.tsrx";

export function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) @{
  <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

export function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) @{
  <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

export function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) @{
  <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

export function AlertDialogOverlay({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) @{
  <AlertDialogPrimitive.Backdrop
    className={cn(
      "fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
      className,
    )}
    data-slot="alert-dialog-overlay"
    {...props}
  />;
}

export function AlertDialogContent({
  className,
  size = "default",
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  size?: "default" | "sm";
}) @{
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Popup
      className={cn(
        "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-3 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 outline-none duration-100 data-[size=default]:max-w-xs data-[size=sm]:max-w-64 data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className,
      )}
      data-size={size}
      data-slot="alert-dialog-content"
      {...props}
    />
  </AlertDialogPortal>;
}

export function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "grid grid-rows-[auto_1fr] place-items-center gap-1 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
      className,
    )}
    data-slot="alert-dialog-header"
    {...props}
  />;
}

export function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
      className,
    )}
    data-slot="alert-dialog-footer"
    {...props}
  />;
}

export function AlertDialogMedia({ className, ...props }: ComponentProps<"div">) @{
  <div
    className={cn(
      "mb-2 inline-flex size-8 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-4",
      className,
    )}
    data-slot="alert-dialog-media"
    {...props}
  />;
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) @{
  <AlertDialogPrimitive.Title
    className={cn(
      "text-sm font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
      className,
    )}
    data-slot="alert-dialog-title"
    {...props}
  />;
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) @{
  <AlertDialogPrimitive.Description
    className={cn(
      "text-xs/relaxed text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
      className,
    )}
    data-slot="alert-dialog-description"
    {...props}
  />;
}

export function AlertDialogAction({
  className,
  ...props
}: ComponentProps<typeof Button>) @{
  <Button className={cn(className)} data-slot="alert-dialog-action" {...props} />;
}

export function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<ComponentProps<typeof Button>, "variant" | "size">) @{
  <AlertDialogPrimitive.Close
    className={cn(className)}
    data-slot="alert-dialog-cancel"
    render={<Button variant={variant} size={size} />}
    {...props}
  />;
}
