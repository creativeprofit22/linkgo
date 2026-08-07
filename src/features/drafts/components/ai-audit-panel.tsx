import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  ShieldQuestion,
} from "lucide-react";
import { PROVIDER_LABELS } from "@/agent/provider-catalog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  DraftAiAuditFinding,
  DraftAiAuditRunStatus,
  DraftAiAuditRuleKey,
  DraftAuditSeverity,
  DraftVariantAiAudit,
} from "@/features/drafts/types";

const ruleLabels: Record<DraftAiAuditRuleKey, string> = {
  hook: "Hook",
  specificity: "Specificity",
  generic_language: "Generic language",
  authenticity: "Authenticity",
  clarity: "Clarity",
  safety: "Safety",
};

const severityLabels: Record<DraftAuditSeverity, string> = {
  pass: "Pass",
  warning: "Warning",
  block: "Block",
};

const severityIconClassName: Record<DraftAuditSeverity, string> = {
  pass: "text-linkgo-green",
  warning: "text-linkgo-amber",
  block: "text-destructive",
};

interface AiAuditPresentation {
  label: string;
  description: string;
  Icon: typeof ShieldQuestion;
  iconClassName: string;
}

function getPresentation(
  status: DraftAiAuditRunStatus | null,
): AiAuditPresentation {
  switch (status) {
    case null:
      return {
        label: "Not run",
        description: "No AI audit has been run for this revision.",
        Icon: ShieldQuestion,
        iconClassName: "text-muted-foreground",
      };
    case "pending":
    case "running":
      return {
        label: "Running",
        description: "The AI audit is in progress for this revision.",
        Icon: Clock3,
        iconClassName: "text-linkgo-blue",
      };
    case "completed":
      return {
        label: "Completed",
        description: "The AI audit completed for this revision.",
        Icon: CheckCircle2,
        iconClassName: "text-linkgo-green",
      };
    case "failed":
      return {
        label: "Failed",
        description: "The AI audit could not be completed for this revision.",
        Icon: CircleAlert,
        iconClassName: "text-destructive",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        description: "The AI audit was cancelled for this revision.",
        Icon: CircleAlert,
        iconClassName: "text-muted-foreground",
      };
  }
}

export function AiAuditPanel({
  audit,
  variantId,
}: {
  audit: DraftVariantAiAudit;
  variantId: number;
}): React.ReactNode {
  const presentation = getPresentation(audit.status);
  const { Icon } = presentation;
  const titleId = `variant-${variantId}-ai-audit-title`;
  const descriptionId = `variant-${variantId}-ai-audit-description`;

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="border-border bg-card rounded-xl border border-l-4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Icon
            aria-hidden="true"
            className={cn("mt-0.5 size-5 shrink-0", presentation.iconClassName)}
          />
          <div className="min-w-0 space-y-1">
            <h3 id={titleId} className="text-sm font-semibold">
              AI audit
              <span className="sr-only"> for variant {variantId}</span>
            </h3>
            <p
              id={descriptionId}
              className="text-muted-foreground text-sm leading-relaxed"
            >
              {presentation.description}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full bg-current",
              presentation.iconClassName,
            )}
          />
          {presentation.label}
        </Badge>
      </div>

      {audit.run !== null && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <AuditMetadata
              label="Provider"
              value={PROVIDER_LABELS[audit.run.provider_key]}
            />
            <AuditMetadata
              label="Model"
              value={audit.run.model_name || "Not recorded"}
            />
            <AuditMetadata
              label="Revision"
              value={String(audit.run.content_revision)}
            />
          </dl>

          {audit.status === "completed" && (
            <>
              <AuditMessage
                label="Summary"
                value={audit.run.summary || "No summary was provided."}
              />
              <AiAuditFindingList findings={audit.findings} />
            </>
          )}

          {(audit.status === "failed" || audit.status === "cancelled") && (
            <AuditMessage
              label={audit.status === "failed" ? "Error" : "Details"}
              value={
                audit.run.error_message ||
                (audit.status === "failed"
                  ? "No error details were recorded."
                  : "No cancellation details were recorded.")
              }
              isError={audit.status === "failed"}
            />
          )}
        </div>
      )}
    </section>
  );
}

function AuditMetadata({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-medium break-words">{value}</dd>
    </div>
  );
}

function AuditMessage({
  label,
  value,
  isError = false,
}: {
  label: string;
  value: string;
  isError?: boolean;
}): React.ReactNode {
  return (
    <div className="space-y-1">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </h4>
      <p
        className={cn(
          "text-sm leading-relaxed break-words",
          isError && "text-destructive font-medium",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function AiAuditFindingList({
  findings,
}: {
  findings: DraftAiAuditFinding[];
}): React.ReactNode {
  return (
    <div className="space-y-2">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Findings ({findings.length}/6)
      </h4>
      <ul aria-label="AI audit findings" className="grid gap-2 sm:grid-cols-2">
        {findings.map((finding) => (
          <li
            key={finding.rule_key}
            className="bg-muted/45 min-w-0 rounded-lg border px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">
                {ruleLabels[finding.rule_key]}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs font-semibold",
                  severityIconClassName[finding.severity],
                )}
              >
                {severityLabels[finding.severity]}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed break-words">
              {finding.message}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
