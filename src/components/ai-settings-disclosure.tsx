import { ChevronRight } from "lucide-react";
import type * as React from "react";

/**
 * Collapsed "AI settings (optional)" disclosure for fields most people never
 * change (like the AI model). Native <details> keeps keyboard and screen-reader
 * behaviour built in; the default value is already filled in.
 */
export function AiSettingsDisclosure({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <details data-ai-settings className="group rounded-md border">
      <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md px-3 py-1.5 text-sm outline-none select-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        AI settings (optional)
      </summary>
      <div className="space-y-2 px-3 pt-1 pb-3">
        <p className="text-muted-foreground text-xs">
          Most people can leave this as it is.
        </p>
        {children}
      </div>
    </details>
  );
}
