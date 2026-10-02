import { cn } from "@/lib/utils";

interface DisabledReasonProps {
  /** Referenced by the disabled control's `aria-describedby`. */
  id: string;
  reason: string;
  /** Where the operator goes to fix it, e.g. `#/campaigns`. */
  fix?: { href: string; label: string } | null;
  className?: string;
}

/**
 * Visible "why is this disabled" text under a disabled action, with an
 * optional link to the screen that fixes it.
 */
export function DisabledReason({
  id,
  reason,
  fix = null,
  className,
}: DisabledReasonProps): React.ReactNode {
  return (
    <p
      id={id}
      className={cn("text-muted-foreground max-w-72 text-xs", className)}
    >
      {reason}
      {fix !== null && (
        <>
          {" "}
          {/* Padded to the 32px hit floor without moving the text. */}
          <a
            href={fix.href}
            className="text-primary focus-visible:ring-ring -my-2 inline-flex min-h-8 items-center rounded-sm px-1 font-medium underline underline-offset-4 outline-none hover:no-underline focus-visible:ring-2"
          >
            {fix.label}
          </a>
        </>
      )}
    </p>
  );
}
