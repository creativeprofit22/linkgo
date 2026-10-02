import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  FileText,
  PenLine,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CandidateStatusBadge } from "@/features/candidate-queue/components/candidate-status-badge";
import type {
  CandidateStatus,
  CandidateWithTarget,
} from "@/features/candidate-queue/types";
import { approvalsRoute } from "@/features/approvals/schemas";
import { contentCalendarRoute } from "@/features/content-calendar/schemas";
import { draftsRoute } from "@/features/drafts/schemas";
import { PostStageTracker, type PostStage } from "@/features/post-stages";
import { navigateTo } from "@/lib/navigation/use-hash-navigation";

interface CandidateCardProps {
  candidate: CandidateWithTarget;
  /** Where this idea's post stands; `null` hides the tracker. */
  stage?: PostStage | null;
  /** False for archived campaigns, where nothing new can be written. */
  canWrite?: boolean;
  onSetStatus: (id: number, status: CandidateStatus) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

interface NextAction {
  label: string;
  icon: React.ReactNode;
  go: () => void;
}

/** The one primary next step for this idea, chosen from its post stage. */
function getNextAction(
  candidate: CandidateWithTarget,
  stage: PostStage | null,
  canWrite: boolean,
): NextAction | null {
  if (stage === null) return null;
  const campaignId = candidate.campaign_id;
  if (stage.key === "idea") {
    if (!canWrite || candidate.status === "rejected") return null;
    return {
      label: "Write post",
      icon: <PenLine aria-hidden="true" className="size-4" />,
      go: () =>
        navigateTo(draftsRoute, {
          campaignId,
          candidateId: candidate.id,
          write: "1",
        }),
    };
  }
  if (stage.key === "draft" || stage.approvalId === null)
    return {
      label: "Open draft",
      icon: <FileText aria-hidden="true" className="size-4" />,
      go: () =>
        navigateTo(draftsRoute, { campaignId, candidateId: candidate.id }),
    };
  const approvalId = stage.approvalId;
  if (stage.key === "scheduled" && stage.state === "current")
    return {
      label: "See on calendar",
      icon: <CalendarDays aria-hidden="true" className="size-4" />,
      go: () => navigateTo(contentCalendarRoute, { campaignId, approvalId }),
    };
  return {
    label: "Open approval",
    icon: <ArrowRight aria-hidden="true" className="size-4" />,
    go: () => navigateTo(approvalsRoute, { campaignId, approvalId }),
  };
}

export function CandidateCard({
  candidate,
  stage = null,
  canWrite = true,
  onSetStatus,
  onDelete,
}: CandidateCardProps): React.ReactNode {
  const next = getNextAction(candidate, stage, canWrite);
  const authorName = candidate.target.author_name || "Unknown author";
  const scoreLabel =
    candidate.relevance_score === null
      ? "Not scored"
      : `${candidate.relevance_score}/100`;

  function confirmDeleteCandidate(): void {
    if (window.confirm("Delete this idea? You can't undo this.")) {
      void onDelete(candidate.id);
    }
  }

  return (
    <Card className="linkgo-card bg-card/82 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate">{authorName}</CardTitle>
              <CandidateStatusBadge status={candidate.status} />
              {candidate.target.author_profile_url && (
                <a
                  href={candidate.target.author_profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-linkgo-blue inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline"
                >
                  <span className="truncate">
                    {candidate.target.author_profile_url}
                  </span>
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <a
              href={candidate.target.url}
              target="_blank"
              rel="noreferrer"
              className="text-linkgo-blue inline-flex max-w-full items-center gap-1 truncate text-sm hover:underline"
            >
              <span className="truncate">{candidate.target.url}</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete idea from ${authorName}`}
            onClick={confirmDeleteCandidate}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="line-clamp-4 text-sm leading-relaxed whitespace-pre-line">
          {candidate.target.content}
        </p>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <InfoBlock label="Campaign" value={candidate.campaign_name} />
          <InfoBlock
            label="Match score"
            value={scoreLabel}
            muted={candidate.relevance_score === null}
          />
          {candidate.source_keyword && (
            <InfoBlock
              label="Source keyword"
              value={candidate.source_keyword}
            />
          )}
          {candidate.target.posted_at && (
            <InfoBlock label="Posted at" value={candidate.target.posted_at} />
          )}
        </div>

        {(candidate.score_reason || candidate.notes) && <Separator />}

        {candidate.score_reason && (
          <TextBlock label="Score reason" value={candidate.score_reason} />
        )}
        {candidate.notes && <TextBlock label="Notes" value={candidate.notes} />}

        {stage !== null && <PostStageTracker stage={stage} />}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {next !== null && (
          <Button type="button" size="sm" onClick={next.go}>
            {next.icon}
            {next.label}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={candidate.status === "shortlisted"}
          onClick={() => void onSetStatus(candidate.id, "shortlisted")}
        >
          Shortlist
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={candidate.status === "rejected"}
          onClick={() => void onSetStatus(candidate.id, "rejected")}
        >
          Reject
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={candidate.status === "drafted"}
          onClick={() => void onSetStatus(candidate.id, "drafted")}
        >
          Mark drafted
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={candidate.status === "new"}
          onClick={() => void onSetStatus(candidate.id, "new")}
        >
          Reset to new
        </Button>
        {next?.label !== "Open draft" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              navigateTo(draftsRoute, {
                campaignId: candidate.campaign_id,
                candidateId: candidate.id,
              })
            }
          >
            <FileText aria-hidden="true" className="size-4" />
            Open drafts
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={confirmDeleteCandidate}
        >
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}

function InfoBlock({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}): React.ReactNode {
  return (
    <div className="bg-background/45 rounded-lg border p-3">
      <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p
        className={
          muted
            ? "text-muted-foreground text-sm leading-relaxed italic"
            : "text-sm leading-relaxed"
        }
      >
        {value}
      </p>
    </div>
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
    <div>
      <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  );
}
