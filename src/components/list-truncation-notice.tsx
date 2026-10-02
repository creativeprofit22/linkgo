import { Info } from "lucide-react";

interface ListTruncationNoticeProps {
  /** Rows actually returned and rendered. */
  shownCount: number;
  /** Rows matching the filter before the native list cap. */
  totalCount: number;
  /** Plural noun for the rows, e.g. "candidates". */
  noun: string;
}

/**
 * Tells the operator that a capped native list is missing rows. Renders
 * nothing when every matching row was returned.
 */
export function ListTruncationNotice({
  shownCount,
  totalCount,
  noun,
}: ListTruncationNoticeProps): React.ReactNode {
  if (totalCount <= shownCount) return null;
  return (
    <p
      role="status"
      data-testid="list-truncation-notice"
      className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
    >
      <Info aria-hidden="true" className="size-4 shrink-0" />
      <span>
        Showing the first {shownCount} of {totalCount} {noun}. Totals marked
        &ldquo;shown&rdquo; only count what&rsquo;s on screen.
      </span>
    </p>
  );
}
