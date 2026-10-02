import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROVIDER_LABELS } from "@/agent/provider-catalog";
import { DRAFT_PROMPT_ROUTES } from "@/features/drafts/prompt-routing";
import type { DraftGenerationRequest } from "@/features/drafts/types";
import { toPlainMessage } from "@/lib/plain-message";

interface DraftGenerationRequestCardProps {
  request: DraftGenerationRequest;
  saveDisabled: boolean;
  onSave: (id: number) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
}

export function DraftGenerationRequestCard({
  request,
  saveDisabled,
  onSave,
  onDismiss,
}: DraftGenerationRequestCardProps): React.ReactNode {
  const candidateExcerpt = request.candidate.target.content
    .trim()
    .slice(0, 140);

  return (
    <Card className="bg-card/70">
      <CardHeader className="space-y-2">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="text-linkgo-blue size-4" /> AI draft #
              {request.id}
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {PROVIDER_LABELS[request.provider_key]} ·{" "}
              {request.model_name || "default model"} ·{" "}
              {request.playbook_key ? "Brand voice on" : "No brand voice"} ·{" "}
              {DRAFT_PROMPT_ROUTES[request.content_intent].label} post
            </p>
          </div>
          <StatusPill status={request.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/30 rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {request.candidate.target.author_name || "Author not known"}
          </p>
          <p className="text-muted-foreground mt-1">
            {candidateExcerpt || "No text saved for this idea."}
          </p>
        </div>

        <div className="bg-muted/20 rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {request.workflow_run_id === null
              ? "One-off draft"
              : `From automation #${request.workflow_run_id}`}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {request.workflow_run_id === null
              ? "Saving creates a draft. No automation is changed."
              : "The automation waits at the Draft step until you save these versions."}
          </p>
        </div>

        {request.summary && (
          <p className="text-muted-foreground text-sm">{request.summary}</p>
        )}
        {request.error_message && (
          <p className="text-destructive text-sm">
            {toPlainMessage(request.error_message)}
          </p>
        )}

        {request.generated_variants.length > 0 && (
          <div className="space-y-3">
            {request.generated_variants.map((variant, index) => (
              <div
                key={`${request.id}-${index}`}
                className="rounded-lg border p-3 text-sm"
              >
                <p className="font-medium">
                  Version {index + 1}: {variant.hook}
                </p>
                <p className="text-muted-foreground mt-2 whitespace-pre-wrap">
                  {variant.body}
                </p>
                {variant.cta && <p className="mt-2">{variant.cta}</p>}
                {variant.hashtags.length > 0 && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {variant.hashtags.join(" ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {request.status === "pending" && (
          <div className="border-info/30 bg-info/5 space-y-3 rounded-lg border p-3">
            <p className="text-info text-sm">
              The AI was stopped before it finished writing. Dismiss this to
              free up{" "}
              {request.workflow_step_id === null
                ? "this idea"
                : "the automation step"}{" "}
              and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onDismiss(request.id)}
            >
              <XCircle className="size-4" /> Dismiss unfinished draft
            </Button>
          </div>
        )}
        {request.status === "generated" && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={saveDisabled}
              onClick={() => void onSave(request.id)}
            >
              <CheckCircle2 className="size-4" /> Save as draft
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void onDismiss(request.id)}
            >
              Dismiss
            </Button>
          </div>
        )}
        {request.status === "failed" && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onDismiss(request.id)}
          >
            <XCircle className="size-4" /> Dismiss failed draft
          </Button>
        )}
        {request.status === "saved" && request.created_draft_id !== null && (
          <p className="text-muted-foreground text-sm">Saved to your drafts.</p>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_LABELS: Record<DraftGenerationRequest["status"], string> = {
  pending: "In progress",
  generated: "Ready to review",
  saved: "Saved",
  failed: "Didn't finish",
  dismissed: "Dismissed",
};

function StatusPill({
  status,
}: {
  status: DraftGenerationRequest["status"];
}): React.ReactNode {
  return (
    <span className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium capitalize">
      {STATUS_LABELS[status]}
    </span>
  );
}
