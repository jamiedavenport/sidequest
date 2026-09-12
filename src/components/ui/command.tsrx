import type { ComponentProps } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { InputGroup, InputGroupAddon } from "~/components/ui/input-group.tsrx";

export function Command({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>) @{
  <CommandPrimitive
    data-slot="command"
    className={cn(
      "flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground",
      className,
    )}
    {...props}
  />;
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>) @{
  <div data-slot="command-input-wrapper" className="p-1 pb-0">
    <InputGroup className="h-11! bg-input/20 dark:bg-input/30">
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "w-full text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs/relaxed",
          className,
        )}
        {...props}
      />
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-50" />
      </InputGroupAddon>
    </InputGroup>
  </div>;
}

export function CommandList({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>) @{
  <CommandPrimitive.List
    data-slot="command-list"
    className={cn(
      "max-h-[min(24rem,60dvh)] scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
      className,
    )}
    {...props}
  />;
}

export function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>) @{
  <CommandPrimitive.Empty
    data-slot="command-empty"
    className={cn("py-6 text-center text-xs/relaxed", className)}
    {...props}
  />;
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>) @{
  <CommandPrimitive.Group
    data-slot="command-group"
    className={cn(
      "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
      className,
    )}
    {...props}
  />;
}

export function CommandItem({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>) @{
  <CommandPrimitive.Item
    data-slot="command-item"
    className={cn(
      "relative flex min-h-11 cursor-default touch-manipulation items-center gap-2 rounded-md px-2.5 py-1.5 text-xs/relaxed outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />;
}
