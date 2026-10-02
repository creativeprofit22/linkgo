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
import { escapeLinkedInLittleText } from "@/features/approvals/linkedin-format";
import { CommentAuditFindingList } from "@/features/comments/components/comment-audit-finding-list";
import {
  CommentAuditSeverityBadge,
  CommentVariantStatusBadge,
} from "@/features/comments/components/comment-status-badge";
import type {
  CommentVariantStatus,
  CommentVariantWithAudits,
  SetCommentVariantStatusInput,
  UpdateCommentVariantInput,
} from "@/features/comments/types";

interface CommentVariantCardProps {
  variant: CommentVariantWithAudits;
  editable: boolean;
  onUpdateVariant: (input: UpdateCommentVariantInput) => Promise<void>;
  onSetVariantStatus: (input: SetCommentVariantStatusInput) => Promise<void>;
}

export function CommentVariantCard({
  variant,
  editable,
  onUpdateVariant,
  onSetVariantStatus,
}: CommentVariantCardProps): React.ReactNode {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [body, setBody] = useState(variant.body);

  async function submitVariantUpdate(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try {
      await onUpdateVariant({ id: variant.id, body });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing(): void {
    setBody(variant.body);
    setEditing(false);
  }

  function setStatus(status: CommentVariantStatus): void {
    void onSetVariantStatus({ id: variant.id, status });
  }

  return (
    <Card className="bg-background/70 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">
              Reply version {variant.variant_number}
            </CardTitle>
            <CommentVariantStatusBadge status={variant.status} />
            <CommentAuditSeverityBadge severity={variant.auditSeverity} />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!editable}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" /> Edit
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {editing ? (
          <form
            className="space-y-4"
            onSubmit={(event) => void submitVariantUpdate(event)}
          >
            <div className="space-y-2">
              <Label htmlFor={`comment-variant-${variant.id}`}>
                Comment text
              </Label>
              <Textarea
                id={`comment-variant-${variant.id}`}
                className="min-h-32"
                value={body}
                maxLength={1250}
                onChange={(event) => setBody(event.target.value)}
                required
              />
              <p className="text-muted-foreground text-xs">
                {body.length}/1,250 characters. Linkgo keeps replies under this
                length to play it safe.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={cancelEditing}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save and check again"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <TextBlock label="Your text" value={variant.body} />
            <TextBlock
              label="How it will look on LinkedIn"
              value={escapeLinkedInLittleText(variant.body)}
            />
          </div>
        )}

        <Separator />
        <CommentAuditFindingList findings={variant.audits} />
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={
            !editable ||
            variant.status === "selected" ||
            variant.auditSeverity === "block"
          }
          onClick={() => setStatus("selected")}
        >
          Use this version
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!editable || variant.status === "rejected"}
          onClick={() => setStatus("rejected")}
        >
          Reject
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!editable || variant.status === "draft"}
          onClick={() => setStatus("draft")}
        >
          Reset
        </Button>
      </CardFooter>
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
      <p className="text-sm leading-relaxed whitespace-pre-wrap">
        {value || "No text added."}
      </p>
    </div>
  );
}
