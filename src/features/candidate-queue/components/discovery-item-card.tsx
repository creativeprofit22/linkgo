import { Lightbulb, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CandidateDiscoveryItem } from "@/features/candidate-queue/types";

interface DiscoveryItemCardProps {
  item: CandidateDiscoveryItem;
  onPromote: (id: number) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
  disabled?: boolean;
}

const kindLabels: Record<CandidateDiscoveryItem["kind"], string> = {
  keyword: "Keyword",
  trend: "Trend",
  source_prompt: "Topic idea",
};

export function DiscoveryItemCard({
  item,
  onPromote,
  onDismiss,
  disabled = false,
}: DiscoveryItemCardProps): React.ReactNode {
  const title = item.keyword || item.title;
  const canPromote = item.kind === "keyword" && item.keyword.trim().length > 0;

  return (
    <Card className="bg-card/80 border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <Badge variant="secondary" className="w-fit">
              {kindLabels[item.kind]}
            </Badge>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <div className="bg-linkgo-blue/10 text-linkgo-blue flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Lightbulb className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {item.title && item.title !== title && (
          <p className="font-medium">{item.title}</p>
        )}
        {item.rationale && (
          <p className="text-muted-foreground leading-relaxed">
            {item.rationale}
          </p>
        )}
        <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
          {item.confidence_score !== null && (
            <span>How sure: {item.confidence_score}/100</span>
          )}
          {item.source_keyword && <span>Source: {item.source_keyword}</span>}
          {item.status === "promoted" && <span>Added to keywords</span>}
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {canPromote && (
          <Button
            type="button"
            size="sm"
            disabled={disabled || item.status === "promoted"}
            onClick={() => void onPromote(item.id)}
          >
            Add to keywords
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void onDismiss(item.id)}
        >
          <X className="size-3" /> Dismiss
        </Button>
      </CardFooter>
    </Card>
  );
}
