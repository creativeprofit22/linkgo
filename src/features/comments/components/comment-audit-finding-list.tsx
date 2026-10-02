import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { CommentAuditFinding } from "@/features/comments/types";

const ruleLabels: Record<string, string> = {
  comment_length: "Length",
  external_link: "Links",
  generic_reply: "Too generic",
  hashtag_limit: "Hashtags",
  mention_limit: "Mentions",
  required_text: "Missing text",
};

function ruleLabel(ruleKey: string): string {
  const known = ruleLabels[ruleKey];
  if (known) return known;
  const words = ruleKey.split("_").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface CommentAuditFindingListProps {
  findings: CommentAuditFinding[];
}

export function CommentAuditFindingList({
  findings,
}: CommentAuditFindingListProps): React.ReactNode {
  if (findings.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No quality check results yet.
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
            <p className="font-medium">{ruleLabel(finding.rule_key)}</p>
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
