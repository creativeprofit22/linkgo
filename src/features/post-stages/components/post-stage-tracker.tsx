import { AlertTriangle, Check, CircleDot, Hand } from "lucide-react";

import {
  POST_STAGE_KEYS,
  POST_STAGE_LABELS,
  type PostStage,
} from "@/features/post-stages/types";
import { cn } from "@/lib/utils";

interface PostStageTrackerProps {
  stage: PostStage;
  className?: string;
}

const STATE_LABELS: Readonly<Record<PostStage["state"], string>> = {
  current: "Now",
  "needs-you": "Needs you",
  problem: "Problem",
};

/**
 * Compact six-step progress line for one post. Stages before the current one
 * are done, the current one carries its state as text (never colour only).
 */
export function PostStageTracker({
  stage,
  className,
}: PostStageTrackerProps): React.ReactNode {
  const currentIndex = POST_STAGE_KEYS.indexOf(stage.key);
  return (
    <div
      className={cn("space-y-1", className)}
      data-testid="post-stage-tracker"
    >
      <ol
        aria-label="Post progress"
        className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs"
      >
        {POST_STAGE_KEYS.map((key, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;
          const label = POST_STAGE_LABELS[key];
          return (
            <li
              key={key}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-0.5",
                isDone && "text-foreground border-transparent",
                !isDone &&
                  !isCurrent &&
                  "text-muted-foreground border-transparent",
                isCurrent &&
                  stage.state !== "problem" &&
                  "border-primary bg-primary/10 text-foreground font-medium",
                isCurrent &&
                  stage.state === "problem" &&
                  "border-destructive/50 bg-destructive/5 text-destructive font-medium",
              )}
            >
              {isDone ? (
                <Check aria-hidden="true" className="size-3" />
              ) : isCurrent && stage.state === "problem" ? (
                <AlertTriangle aria-hidden="true" className="size-3" />
              ) : isCurrent && stage.state === "needs-you" ? (
                <Hand aria-hidden="true" className="size-3" />
              ) : isCurrent ? (
                <CircleDot aria-hidden="true" className="size-3" />
              ) : null}
              <span>{label}</span>
              {isDone ? <span className="sr-only">(done)</span> : null}
              {isCurrent ? (
                <span className="sr-only">({STATE_LABELS[stage.state]})</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p
        className={cn(
          "text-xs",
          stage.state === "problem"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      >
        {stage.detail}
      </p>
    </div>
  );
}
