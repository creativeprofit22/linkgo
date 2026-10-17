import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatAverage,
  patternLessonEvidence,
  patternLessonSummary,
} from "@/features/metrics/patterns";
import type {
  CampaignMemory,
  CreateCampaignMemoryInput,
  ResultPattern,
  ResultPatternDimension,
  ResultPatternsReport,
} from "@/features/metrics/types";

const DIMENSION_TITLES: Record<ResultPatternDimension, string> = {
  opening: "Opening line",
  format: "Post format",
  weekday: "Day posted",
  timeOfDay: "Time posted",
};

interface ResultPatternsPanelProps {
  report: ResultPatternsReport;
  campaignId: number | null;
  campaignArchived: boolean;
  memory: CampaignMemory[];
  onSaveLesson: (input: CreateCampaignMemoryInput) => Promise<void>;
}

/**
 * "What's working": plain comparisons from the user's own results, with the
 * sample size always shown. Saving a lesson is always a human click.
 */
export function ResultPatternsPanel({
  report,
  campaignId,
  campaignArchived,
  memory,
  onSaveLesson,
}: ResultPatternsPanelProps): React.ReactNode {
  return (
    <section className="space-y-4" aria-labelledby="result-patterns-title">
      <div>
        <h3 id="result-patterns-title" className="text-lg font-semibold">
          What&rsquo;s working
        </h3>
        <p className="text-muted-foreground text-sm">
          Average reactions, comments and reposts per post, from{" "}
          {report.sampleSize} measured{" "}
          {report.sampleSize === 1 ? "post" : "posts"}. Not adjusted for how
          many people saw each post.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {report.patterns.map((pattern) => (
          <PatternCard
            key={pattern.dimension}
            pattern={pattern}
            campaignId={campaignId}
            campaignArchived={campaignArchived}
            memory={memory}
            onSaveLesson={onSaveLesson}
          />
        ))}
      </div>
    </section>
  );
}

function PatternCard({
  pattern,
  campaignId,
  campaignArchived,
  memory,
  onSaveLesson,
}: {
  pattern: ResultPattern;
  campaignId: number | null;
  campaignArchived: boolean;
  memory: CampaignMemory[];
  onSaveLesson: (input: CreateCampaignMemoryInput) => Promise<void>;
}): React.ReactNode {
  const [saving, setSaving] = useState(false);
  const title = DIMENSION_TITLES[pattern.dimension];

  return (
    <Card className="bg-card/75" data-testid={`pattern-${pattern.dimension}`}>
      <CardContent className="space-y-2 p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
        {pattern.kind === "thin" ? (
          <p className="text-muted-foreground text-sm">
            {pattern.reason === "few-posts"
              ? `Not enough results yet: ${pattern.sampleSize} of ${pattern.neededPosts} posts needed.`
              : `Your ${pattern.sampleSize} posts are too alike here to compare yet.`}
          </p>
        ) : pattern.kind === "no-difference" ? (
          <p className="text-muted-foreground text-sm">
            No clear winner across {pattern.sampleSize} posts.
          </p>
        ) : (
          <FoundPattern
            pattern={pattern}
            saving={saving}
            canSave={campaignId !== null && !campaignArchived}
            saved={memory.some(
              (item) => item.summary === patternLessonSummary(pattern),
            )}
            onSave={async () => {
              if (campaignId === null) return;
              setSaving(true);
              try {
                await onSaveLesson({
                  campaignId,
                  signal: "winner",
                  summary: patternLessonSummary(pattern),
                  evidence: patternLessonEvidence(pattern),
                });
              } finally {
                setSaving(false);
              }
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function FoundPattern({
  pattern,
  saving,
  canSave,
  saved,
  onSave,
}: {
  pattern: Extract<ResultPattern, { kind: "found" }>;
  saving: boolean;
  canSave: boolean;
  saved: boolean;
  onSave: () => Promise<void>;
}): React.ReactNode {
  const { best, runnerUp, sampleSize } = pattern;
  return (
    <>
      <p className="font-medium">
        {best.label} did better: {formatAverage(best.averageEngagement)} vs{" "}
        {formatAverage(runnerUp.averageEngagement)}
      </p>
      <p className="text-muted-foreground text-sm">
        {best.postCount} of {sampleSize} posts · runner-up:{" "}
        {runnerUp.label.toLowerCase()} ({runnerUp.postCount} posts)
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canSave || saving || saved}
        onClick={() => void onSave()}
      >
        <Lightbulb aria-hidden="true" className="size-4" />
        {saved ? "Saved as lesson" : saving ? "Saving…" : "Save as lesson"}
      </Button>
    </>
  );
}
