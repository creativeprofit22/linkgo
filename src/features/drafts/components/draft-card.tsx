import { Archive, ArrowRight, ExternalLink, Send } from "lucide-react";
import { DisabledReason } from "@/components/disabled-reason";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DraftVariantCard } from "@/features/drafts/components/draft-variant-card";
import { DRAFT_PROMPT_ROUTES } from "@/features/drafts/prompt-routing";
import {
  DraftAuditSeverityBadge,
  DraftStatusBadge,
} from "@/features/drafts/components/draft-status-badge";
import type {
  DraftAuditSeverity,
  DraftWithDetails,
  RunDraftAiAuditInput,
  SetDraftVariantStatusInput,
  UpdateDraftVariantInput,
} from "@/features/drafts/types";
import { approvalsRoute } from "@/features/approvals/schemas";
import { PostStageTracker, type PostStage } from "@/features/post-stages";
import { navigateTo } from "@/lib/navigation/use-hash-navigation";

interface DraftCardProps {
  draft: DraftWithDetails;
  /** Where this draft's post stands; `null` hides the tracker and next step. */
  stage?: PostStage | null;
  onUpdateVariant: (input: UpdateDraftVariantInput) => Promise<void>;
  onSetVariantStatus: (input: SetDraftVariantStatusInput) => Promise<void>;
  onArchiveDraft: (id: number) => Promise<void>;
  onRunAiAudit: (input: RunDraftAiAuditInput) => Promise<void>;
  qualityPendingVariantIds: ReadonlySet<number>;
  onRunQuality: (variantId: number) => Promise<void>;
  onResumeQuality: (variantId: number, runId: number) => Promise<void>;
}

const SEVERITY_RANK: Record<DraftAuditSeverity, number> = {
  block: 0,
  warning: 1,
  pass: 2,
};

function getHighestSeverity(draft: DraftWithDetails): DraftAuditSeverity {
  return draft.variants.reduce<DraftAuditSeverity>((highest, variant) => {
    return SEVERITY_RANK[variant.auditSeverity] < SEVERITY_RANK[highest]
      ? variant.auditSeverity
      : highest;
  }, "pass");
}

/**
 * Why Send for approval is unavailable, or `null` when the draft looks ready.
 * Mirrors the native create gate using its `approvalReady` read; the Approvals
 * screen still re-checks eligibility natively, so this only guides.
 */
function getSendBlocker(draft: DraftWithDetails): string | null {
  if (draft.status === "archived")
    return "This draft is archived, so it can't be sent.";
  const chosen = draft.variants.filter(
    (variant) => variant.status === "selected",
  );
  const [selected] = chosen;
  if (
    chosen.length !== 1 ||
    selected === undefined ||
    draft.status !== "ready_for_review"
  )
    return "Choose a version and pass checks first.";
  if (!selected.approvalReady)
    return selected.auditSeverity === "block" ||
      selected.aiAudit.findings.some((finding) => finding.severity === "block")
      ? "This version has a blocking issue — fix it first."
      : "Run the checks on this version's latest text first.";
  return null;
}

function DraftNextStep({
  draft,
  stage,
}: {
  draft: DraftWithDetails;
  stage: PostStage;
}): React.ReactNode {
  if (stage.approvalId !== null) {
    const approvalId = stage.approvalId;
    return (
      <Button
        type="button"
        size="sm"
        onClick={() =>
          navigateTo(approvalsRoute, {
            campaignId: draft.campaign_id,
            approvalId,
          })
        }
      >
        <ArrowRight aria-hidden="true" className="size-4" />
        Open approval
      </Button>
    );
  }
  const blocker = getSendBlocker(draft);
  const reasonId = `draft-${draft.id}-send-reason`;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        disabled={blocker !== null}
        aria-describedby={blocker === null ? undefined : reasonId}
        onClick={() =>
          navigateTo(approvalsRoute, {
            campaignId: draft.campaign_id,
            draftId: draft.id,
            send: "1",
          })
        }
      >
        <Send aria-hidden="true" className="size-4" />
        Send for approval
      </Button>
      {blocker !== null && <DisabledReason id={reasonId} reason={blocker} />}
    </div>
  );
}

export function DraftCard({
  draft,
  stage = null,
  onUpdateVariant,
  onSetVariantStatus,
  onArchiveDraft,
  onRunAiAudit,
  qualityPendingVariantIds,
  onRunQuality,
  onResumeQuality,
}: DraftCardProps): React.ReactNode {
  const authorName = draft.candidate.target.author_name || "Author not known";
  const highestSeverity = getHighestSeverity(draft);

  function confirmArchiveDraft(): void {
    if (
      window.confirm(
        "Archive this draft? It stays in your history but is hidden from your active drafts.",
      )
    ) {
      void onArchiveDraft(draft.id);
    }
  }

  return (
    <Card className="linkgo-card bg-card/82 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate">{authorName}</CardTitle>
              <DraftStatusBadge status={draft.status} />
              <DraftAuditSeverityBadge severity={highestSeverity} />
              <Badge variant="outline">
                {DRAFT_PROMPT_ROUTES[draft.content_intent].label} post
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {draft.campaign_name} · {draft.variants.length} versions
            </p>
            <a
              href={draft.candidate.target.url}
              target="_blank"
              rel="noreferrer"
              className="text-linkgo-blue inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline"
            >
              <span className="truncate">{draft.candidate.target.url}</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft.status === "archived"}
            onClick={confirmArchiveDraft}
          >
            <Archive className="size-4" /> Archive
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-3">
          <TextBlock
            label="Original post"
            value={draft.candidate.target.content}
          />
          {draft.angle && <TextBlock label="Angle" value={draft.angle} />}
          {draft.notes && <TextBlock label="Notes" value={draft.notes} />}
        </div>

        {stage !== null && (
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <PostStageTracker stage={stage} />
            <DraftNextStep draft={draft} stage={stage} />
          </div>
        )}

        <Separator />

        <div className="space-y-4">
          {draft.variants.map((variant) => (
            <DraftVariantCard
              key={variant.id}
              variant={variant}
              onUpdateVariant={onUpdateVariant}
              onSetVariantStatus={onSetVariantStatus}
              onRunAiAudit={onRunAiAudit}
              qualityPending={qualityPendingVariantIds.has(variant.id)}
              onRunQuality={onRunQuality}
              onResumeQuality={onResumeQuality}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TextBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="line-clamp-5 text-sm leading-relaxed whitespace-pre-line">
        {value}
      </p>
    </div>
  );
}
