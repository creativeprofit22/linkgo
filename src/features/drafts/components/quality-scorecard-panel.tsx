import { useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Gauge, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DraftVariantWithAudits } from "@/features/drafts/types";

const LABELS = {
  hook_strength: "Hook strength",
  authenticity: "Authenticity",
  linkedin_fit: "LinkedIn fit",
  specificity: "Specificity",
  narrative_structure: "Narrative structure",
} as const;

export function QualityScorecardPanel({
  variant,
  pending,
  onRun,
  onResume,
}: {
  variant: DraftVariantWithAudits;
  pending: boolean;
  onRun: () => Promise<void>;
  onResume: (runId: number) => Promise<void>;
}): React.ReactNode {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scorecard = variant.qualityScorecard;
  const run = scorecard?.run;
  const latest =
    scorecard === null || scorecard === undefined
      ? undefined
      : scorecard.attempts[scorecard.attempts.length - 1];
  const ready =
    variant.aiAudit.status === "completed" &&
    variant.aiAudit.findings.length === 6 &&
    variant.aiAudit.findings.every((finding) => finding.severity !== "block");
  // Native resume allocates MAX(attempt_number) + 1, capped at three.
  const lastAttemptNumber = Math.max(
    0,
    ...(scorecard?.attempts.map((attempt) => attempt.attempt_number) ?? []),
  );
  const currentRun = run?.current_content_revision === variant.content_revision;
  const recoverable =
    run?.status === "failed" && currentRun && lastAttemptNumber < 3;
  const terminal =
    run !== undefined &&
    (run.status === "needs_revision" ||
      (run.status === "failed" && !recoverable));
  const label =
    pending || run?.status === "running"
      ? "Running"
      : run?.status === "passed"
        ? "Passed"
        : run?.status === "needs_revision"
          ? "Needs revision"
          : run?.status === "failed"
            ? "Failed"
            : "Not scored";

  return (
    <section
      aria-labelledby={`quality-${variant.id}-title`}
      className="border-border bg-card rounded-xl border border-l-4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id={`quality-${variant.id}-title`}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <Gauge className="size-4" /> Draft quality
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Five-category score against the fixed 70 quality threshold.
          </p>
        </div>
        <Badge variant="outline">{label}</Badge>
      </div>
      {run !== undefined && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <p>
              <strong>{run.final_score ?? latest?.overall_score ?? "—"}</strong>
              /100
            </p>
            <p>Attempt {latest?.attempt_number ?? 1}</p>
            <p>{run.applied_rewrite_count}/2 rewrites</p>
            <p>Revision {run.current_content_revision}</p>
          </div>
          {latest !== undefined && latest.categoryScores.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {latest.categoryScores.map((item) => (
                <li
                  key={item.category_key}
                  className="bg-muted/40 rounded-md p-3 text-sm"
                >
                  <div className="flex justify-between gap-2 font-medium">
                    <span>{LABELS[item.category_key]}</span>
                    <span>{item.score}</span>
                  </div>
                  <p className="text-muted-foreground mt-1">{item.feedback}</p>
                </li>
              ))}
            </ul>
          )}
          {(run.error_message || run.summary) && (
            <p
              role={run.status === "failed" ? "alert" : undefined}
              className="text-muted-foreground text-sm"
            >
              {run.error_message || run.summary}
            </p>
          )}
        </div>
      )}
      <div aria-live="polite" className="mt-4">
        {terminal && (
          <p className="text-muted-foreground mb-3 text-sm">
            {currentRun
              ? "This quality run cannot resume. Edit the draft, re-audit the current revision, then re-score with Run quality loop."
              : "This quality run belongs to an older revision. Re-audit the current draft, then re-score with Run quality loop."}
          </p>
        )}
        {!ready && (run === undefined || recoverable || terminal) && (
          <p className="text-muted-foreground mb-3 text-sm">
            Complete the current revision’s canonical AI audit with no blocking
            findings first.
          </p>
        )}
        {confirming ? (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm quality loop"
            className="bg-muted/40 rounded-lg border p-3"
          >
            <p className="text-sm">
              Run quality loop? It may automatically rewrite this draft up to
              two times, with an AI re-audit after each change.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() =>
                  void onRun().finally(() => {
                    setConfirming(false);
                    triggerRef.current?.focus();
                  })
                }
              >
                Confirm and run
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setConfirming(false);
                  triggerRef.current?.focus();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : recoverable ? (
          <Button
            type="button"
            size="sm"
            disabled={pending || !ready}
            onClick={() => void onResume(run.id)}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" /> Resuming…
              </>
            ) : (
              <>
                <CircleAlert className="size-4" /> Resume quality loop
              </>
            )}
          </Button>
        ) : (
          run?.status !== "passed" && (
            <Button
              ref={triggerRef}
              type="button"
              size="sm"
              disabled={!ready || pending || run?.status === "running"}
              onClick={() => setConfirming(true)}
            >
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}{" "}
              Run quality loop
            </Button>
          )
        )}
      </div>
    </section>
  );
}
