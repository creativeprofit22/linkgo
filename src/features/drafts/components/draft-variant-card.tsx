import { Pencil } from "lucide-react";
import { useState, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AiAuditPanel } from "@/features/drafts/components/ai-audit-panel";
import { AuditFindingList } from "@/features/drafts/components/audit-finding-list";
import { QualityScorecardPanel } from "@/features/drafts/components/quality-scorecard-panel";
import {
  DraftAuditSeverityBadge,
  DraftVariantStatusBadge,
} from "@/features/drafts/components/draft-status-badge";
import type {
  DraftVariantStatus,
  DraftVariantWithAudits,
  RunDraftAiAuditInput,
  SetDraftVariantStatusInput,
  UpdateDraftVariantInput,
} from "@/features/drafts/types";

interface DraftVariantCardProps {
  variant: DraftVariantWithAudits;
  onUpdateVariant: (input: UpdateDraftVariantInput) => Promise<void>;
  onSetVariantStatus: (input: SetDraftVariantStatusInput) => Promise<void>;
  onRunAiAudit: (input: RunDraftAiAuditInput) => Promise<void>;
  qualityPending: boolean;
  onRunQuality: (variantId: number) => Promise<void>;
  onResumeQuality: (variantId: number, runId: number) => Promise<void>;
}

interface VariantEditorState {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

function createEditorState(
  variant: DraftVariantWithAudits,
): VariantEditorState {
  return {
    hook: variant.hook,
    body: variant.body,
    cta: variant.cta,
    hashtags: variant.hashtags,
  };
}

export function DraftVariantCard({
  variant,
  onUpdateVariant,
  onSetVariantStatus,
  onRunAiAudit,
  qualityPending,
  onRunQuality,
  onResumeQuality,
}: DraftVariantCardProps): React.ReactNode {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<VariantEditorState>(() =>
    createEditorState(variant),
  );

  function updateEditor(field: keyof VariantEditorState, value: string): void {
    setEditor((current) => ({ ...current, [field]: value }));
  }

  async function submitVariantUpdate(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try {
      await onUpdateVariant({ id: variant.id, ...editor });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing(): void {
    setEditor(createEditorState(variant));
    setEditing(false);
  }

  function setStatus(status: DraftVariantStatus): void {
    void onSetVariantStatus({ id: variant.id, status });
  }

  return (
    <Card className="bg-background/70 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">
              Variant {variant.variant_number}
            </CardTitle>
            <DraftVariantStatusBadge status={variant.status} />
            <DraftAuditSeverityBadge severity={variant.auditSeverity} />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" />
            Edit variant
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {editing ? (
          <form
            className="space-y-4"
            onSubmit={(event) => void submitVariantUpdate(event)}
          >
            <VariantTextarea
              id={`variant-${variant.id}-hook`}
              label="Hook"
              maxLength={500}
              value={editor.hook}
              onChange={(value) => updateEditor("hook", value)}
            />
            <VariantTextarea
              id={`variant-${variant.id}-body`}
              label="Body"
              maxLength={3000}
              minHeightClassName="min-h-32"
              value={editor.body}
              onChange={(value) => updateEditor("body", value)}
            />
            <VariantTextarea
              id={`variant-${variant.id}-cta`}
              label="CTA"
              maxLength={500}
              value={editor.cta}
              onChange={(value) => updateEditor("cta", value)}
            />
            <VariantTextarea
              id={`variant-${variant.id}-hashtags`}
              label="Hashtags"
              maxLength={300}
              value={editor.hashtags}
              onChange={(value) => updateEditor("hashtags", value)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={cancelEditing}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save and re-audit"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <VariantTextBlock label="Hook" value={variant.hook} />
            <VariantTextBlock label="Body" value={variant.body} />
            <VariantTextBlock label="CTA" value={variant.cta} />
            <VariantTextBlock label="Hashtags" value={variant.hashtags} />
          </div>
        )}

        <Separator />
        <section
          aria-labelledby={`variant-${variant.id}-deterministic-checks-title`}
          className="space-y-3"
        >
          <div className="space-y-1">
            <h3
              id={`variant-${variant.id}-deterministic-checks-title`}
              className="text-sm font-semibold"
            >
              Deterministic checks
              <span className="sr-only"> for variant {variant.id}</span>
            </h3>
            <p className="text-muted-foreground text-sm">
              Rule-based checks run locally whenever the draft changes.
            </p>
          </div>
          <AuditFindingList findings={variant.audits} />
        </section>

        <AiAuditPanel
          audit={variant.aiAudit}
          variantId={variant.id}
          onRun={onRunAiAudit}
        />
        <QualityScorecardPanel
          variant={variant}
          pending={qualityPending}
          onRun={() => onRunQuality(variant.id)}
          onResume={(runId) => onResumeQuality(variant.id, runId)}
        />
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={variant.status === "selected"}
          onClick={() => setStatus("selected")}
        >
          Select for review
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={variant.status === "rejected"}
          onClick={() => setStatus("rejected")}
        >
          Reject variant
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={variant.status === "draft"}
          onClick={() => setStatus("draft")}
        >
          Reset variant
        </Button>
      </CardFooter>
    </Card>
  );
}

function VariantTextBlock({
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
      <p className="text-sm leading-relaxed whitespace-pre-wrap">
        {value || "No text added."}
      </p>
    </div>
  );
}

function VariantTextarea({
  id,
  label,
  maxLength,
  minHeightClassName,
  value,
  onChange,
}: {
  id: string;
  label: string;
  maxLength: number;
  minHeightClassName?: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactNode {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={minHeightClassName}
      />
      <p className="text-muted-foreground text-xs">
        {value.length}/{maxLength}
      </p>
    </div>
  );
}
