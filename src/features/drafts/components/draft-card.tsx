import { Archive, ExternalLink } from "lucide-react";
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
  SetDraftVariantStatusInput,
  UpdateDraftVariantInput,
} from "@/features/drafts/types";

interface DraftCardProps {
  draft: DraftWithDetails;
  onUpdateVariant: (input: UpdateDraftVariantInput) => Promise<void>;
  onSetVariantStatus: (input: SetDraftVariantStatusInput) => Promise<void>;
  onArchiveDraft: (id: number) => Promise<void>;
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

export function DraftCard({
  draft,
  onUpdateVariant,
  onSetVariantStatus,
  onArchiveDraft,
}: DraftCardProps): React.ReactNode {
  const authorName = draft.candidate.target.author_name || "Unknown author";
  const highestSeverity = getHighestSeverity(draft);

  function confirmArchiveDraft(): void {
    if (
      window.confirm(
        "Archive this draft? It can stay in local history but will be hidden from active work.",
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
                {DRAFT_PROMPT_ROUTES[draft.content_intent].label} intent
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {draft.campaign_name} · {draft.variants.length} variants
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
            label="Source post"
            value={draft.candidate.target.content}
          />
          {draft.angle && <TextBlock label="Angle" value={draft.angle} />}
          {draft.notes && <TextBlock label="Notes" value={draft.notes} />}
        </div>

        <Separator />

        <div className="space-y-4">
          {draft.variants.map((variant) => (
            <DraftVariantCard
              key={variant.id}
              variant={variant}
              onUpdateVariant={onUpdateVariant}
              onSetVariantStatus={onSetVariantStatus}
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
