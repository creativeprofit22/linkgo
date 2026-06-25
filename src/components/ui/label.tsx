import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>): React.ReactNode {
  return (
    <LabelPrimitive.Root
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

export { Label };
