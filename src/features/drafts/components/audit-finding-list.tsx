import { CheckCircle2, OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftAuditFinding } from "@/features/drafts/types";

const severityIcon = {
  block: OctagonAlert,
  warning: TriangleAlert,
  pass: CheckCircle2,
} as const;

const severityClassName = {
  block: "text-destructive",
  warning: "text-linkgo-amber",
  pass: "text-linkgo-green",
} as const;

/** Turns a stored rule key like `max_length` into a readable "Max length". */
function formatRuleKey(ruleKey: string): string {
  const words = ruleKey.replace(/[_-]+/g, " ").trim();
  return words === ""
    ? "Check"
    : words.charAt(0).toUpperCase() + words.slice(1);
}

export function AuditFindingList({
  findings,
}: {
  findings: DraftAuditFinding[];
}): React.ReactNode {
  if (findings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No check results yet.</p>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Automatic check results">
      {findings.map((finding) => {
        const Icon = severityIcon[finding.severity];
        return (
          <li
            key={`${finding.rule_key}-${finding.severity}-${finding.message}`}
            className="bg-muted/45 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                severityClassName[finding.severity],
              )}
            />
            <span className="min-w-0">
              <span className="font-medium">
                {formatRuleKey(finding.rule_key)}
              </span>
              <span className="text-muted-foreground">
                {": "}
                {finding.message}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
