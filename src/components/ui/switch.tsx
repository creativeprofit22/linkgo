import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>): React.ReactNode {
  return (
    <SwitchPrimitive.Root
      className={cn(
        // The button is the hit area (44×32, 44×44 for touch); the visible
        // 36×20 track is drawn by ::before so the look is unchanged.
        "peer focus-visible:before:ring-ring data-[state=checked]:before:bg-primary data-[state=unchecked]:before:bg-input relative inline-flex h-8 w-11 shrink-0 cursor-pointer items-center rounded-full outline-none before:absolute before:top-1/2 before:left-1 before:h-5 before:w-9 before:-translate-y-1/2 before:rounded-full before:transition-colors focus-visible:before:ring-2 focus-visible:before:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 forced-colors:before:border pointer-coarse:h-11",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="bg-background pointer-events-none relative block size-4 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-1.5" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
