import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { CommentAuditFinding } from "@/features/comments/types";

interface CommentAuditFindingListProps {
  findings: CommentAuditFinding[];
}

export function CommentAuditFindingList({
  findings,
}: CommentAuditFindingListProps): React.ReactNode {
  if (findings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No audit findings have been stored yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {findings.map((finding) => (
        <div
          key={`${finding.rule_key}-${finding.severity}-${finding.message}`}
          className="bg-card/70 flex gap-2 rounded-lg border p-3 text-sm"
        >
          <FindingIcon severity={finding.severity} />
          <div>
            <p className="font-medium">
              {finding.rule_key.split("_").join(" ")}
            </p>
            <p className="text-muted-foreground">{finding.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FindingIcon({
  severity,
}: {
  severity: CommentAuditFinding["severity"];
}): React.ReactNode {
  if (severity === "block") {
    return (
      <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" />
    );
  }
  if (severity === "warning") {
    return <Info className="text-warning mt-0.5 size-4 shrink-0" />;
  }
  return <CheckCircle2 className="text-linkgo-green mt-0.5 size-4 shrink-0" />;
}
