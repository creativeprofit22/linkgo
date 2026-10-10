import { cn } from "@/lib/utils";

export interface SupportDetail {
  label: string;
  value: string | number;
}

interface SupportDetailsProps {
  /** Internal ids, references and provider names support may ask for. */
  items: readonly SupportDetail[];
  className?: string;
}

/**
 * Collapsed "Details for support" disclosure. Keeps internal references out of
 * the primary UI (see docs/glossary.md) while leaving them one click away.
 * Native `<details>` gives keyboard and screen reader support for free.
 */
export function SupportDetails({
  items,
  className,
}: SupportDetailsProps): React.ReactNode {
  if (items.length === 0) return null;
  return (
    <details
      data-support
      className={cn("text-muted-foreground text-xs", className)}
    >
      <summary className="focus-visible:ring-ring inline-flex min-h-8 cursor-pointer items-center rounded-sm px-1 font-medium outline-none select-none hover:underline focus-visible:ring-2">
        Details for support
      </summary>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-1">
        {items.map((item) => (
          <div key={item.label} className="contents">
            <dt className="font-medium">{item.label}</dt>
            <dd className="break-all">{item.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
