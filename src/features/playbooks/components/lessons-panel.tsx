import { AlertCircle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { metricsRoute } from "@/features/metrics/schemas";
import type { MemorySignal } from "@/features/metrics/types";
import { useLessons } from "@/features/playbooks/hooks/use-lessons";
import { formatRouteHash } from "@/lib/navigation/route-contract";

const SIGNAL_LABELS: Record<MemorySignal, string> = {
  winner: "Do more",
  insight: "Do more",
  underperformer: "Avoid",
  avoid: "Avoid",
};

/**
 * "Lessons from your results": every saved lesson, with a switch that
 * decides whether new drafts use it. Off keeps the lesson but archives it.
 */
export function LessonsPanel(): React.ReactNode {
  const { groups, loading, error, updatingId, loadLessons, setLessonEnabled } =
    useLessons();

  return (
    <section
      className="space-y-4"
      aria-labelledby="lessons-title"
      aria-busy={loading}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h3 id="lessons-title" className="text-lg font-semibold">
            Lessons from your results
          </h3>
          <p className="text-muted-foreground text-sm">
            Lessons that are on shape every new draft for their campaign (up to
            5, newest first).
          </p>
        </div>
        <a
          href={formatRouteHash(metricsRoute)}
          className="text-linkgo-blue inline-flex min-h-8 items-center text-sm font-medium underline-offset-4 hover:underline pointer-coarse:min-h-11"
        >
          See results in Analytics
        </a>
      </div>

      {loading ? (
        <Card className="bg-card/70">
          <CardContent
            role="status"
            className="text-muted-foreground p-4 text-sm"
          >
            Loading lessons…
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle
                aria-hidden="true"
                className="text-destructive size-5"
              />
              <p className="text-sm">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadLessons()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="bg-card/70 border-dashed">
          <CardContent className="text-muted-foreground p-4 text-sm">
            No lessons yet. Add results for your posts in Analytics, then save
            what worked as a lesson.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card
              key={group.campaignId}
              className="bg-card/75"
              data-testid="lesson-group"
            >
              <CardContent className="space-y-3 p-4">
                <p className="text-sm font-medium">
                  {group.campaignName}
                  {group.campaignArchived ? " (archived)" : ""}
                </p>
                <ul className="divide-y">
                  {group.lessons.map((lesson) => {
                    const switchId = `lesson-${lesson.id}`;
                    const on = lesson.status === "active";
                    return (
                      <li
                        key={lesson.id}
                        className="flex items-center justify-between gap-4 py-2"
                        data-testid="lesson-row"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <Lightbulb
                            aria-hidden="true"
                            className="text-linkgo-blue mt-0.5 size-4 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm">{lesson.summary}</p>
                            <p className="text-muted-foreground text-xs">
                              {SIGNAL_LABELS[lesson.signal]}
                            </p>
                          </div>
                        </div>
                        {/* The whole label is the click target (≥ 44px tall),
                            not just the 36×20 switch track. */}
                        <label
                          htmlFor={switchId}
                          className="text-muted-foreground hover:bg-muted/50 flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-xs"
                        >
                          Use in drafts
                          <Switch
                            id={switchId}
                            checked={on}
                            disabled={
                              group.campaignArchived || updatingId === lesson.id
                            }
                            onCheckedChange={(next) =>
                              void setLessonEnabled(lesson.id, next)
                            }
                            aria-label={`Use in drafts: ${lesson.summary}`}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
