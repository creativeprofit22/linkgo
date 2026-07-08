import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DraftGenerationRequest } from "@/features/drafts/types";

interface DraftGenerationRequestCardProps {
  request: DraftGenerationRequest;
  onSave: (id: number) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
}

export function DraftGenerationRequestCard({
  request,
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
              <Sparkles className="text-linkgo-blue size-4" /> Generated request
              #{request.id}
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {request.provider_key}/{request.model_name || "default"} ·{" "}
              {request.playbook_key || "no playbook"} · Candidate #
              {request.candidate_post_id}
            </p>
          </div>
          <StatusPill status={request.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/30 rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {request.candidate.target.author_name || "Unknown author"}
          </p>
          <p className="text-muted-foreground mt-1">
            {candidateExcerpt || "No candidate text captured."}
          </p>
        </div>

        {request.summary && (
          <p className="text-muted-foreground text-sm">{request.summary}</p>
        )}
        {request.error_message && (
          <p className="text-destructive text-sm">{request.error_message}</p>
        )}

        {request.generated_variants.length > 0 && (
          <div className="space-y-3">
            {request.generated_variants.map((variant, index) => (
              <div
                key={`${request.id}-${index}`}
                className="rounded-lg border p-3 text-sm"
              >
                <p className="font-medium">
                  Variant {index + 1}: {variant.hook}
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

        {request.status === "generated" && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onSave(request.id)}>
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
            <XCircle className="size-4" /> Dismiss failed request
          </Button>
        )}
        {request.status === "saved" && request.created_draft_id !== null && (
          <p className="text-muted-foreground text-sm">
            Saved as draft #{request.created_draft_id}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({
  status,
}: {
  status: DraftGenerationRequest["status"];
}): React.ReactNode {
  return (
    <span className="bg-muted rounded-full px-2.5 py-1 text-xs font-medium capitalize">
      {status.replace("_", " ")}
    </span>
  );
}
