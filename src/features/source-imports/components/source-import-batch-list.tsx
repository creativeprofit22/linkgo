import { AlertCircle, History, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  SourceImportBatchDetail,
  SourceImportBatchStatus,
  SourceImportItemStatus,
} from "@/features/source-imports/types";

interface SourceImportBatchListProps {
  batches: SourceImportBatchDetail[];
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
}

const BATCH_STATUS_LABELS: Record<SourceImportBatchStatus, string> = {
  processing: "Processing",
  completed: "Completed",
  completed_with_errors: "Review items",
  failed: "Failed",
};

const ITEM_STATUS_LABELS: Record<SourceImportItemStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  duplicate: "Duplicate",
  rejected: "Rejected",
};

function formatImportTime(value: string): string {
  const normalized = value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getBatchBadgeVariant(
  status: SourceImportBatchStatus,
): "default" | "destructive" | "outline" | "secondary" {
  if (status === "failed") return "destructive";
  if (status === "completed") return "default";
  if (status === "processing") return "secondary";
  return "outline";
}

function BatchDetail({
  batch,
  open,
}: {
  batch: SourceImportBatchDetail;
  open: boolean;
}): React.ReactNode {
  return (
    <details open={open} className="group border-b last:border-b-0">
      <summary className="focus-visible:ring-ring flex cursor-pointer list-none flex-col gap-3 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Batch {batch.id}</span>
            <Badge variant={getBatchBadgeVariant(batch.status)}>
              {BATCH_STATUS_LABELS[batch.status]}
            </Badge>
          </div>
          <time
            className="text-muted-foreground block text-xs"
            dateTime={batch.created_at}
          >
            {formatImportTime(batch.created_at)}
          </time>
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>{batch.accepted_count} accepted</span>
          <span>{batch.duplicate_count} duplicate</span>
          <span>{batch.rejected_count} rejected</span>
        </div>
      </summary>

      <div className="bg-muted/20 border-t px-4 py-3">
        {batch.error_message ? (
          <p className="text-destructive mb-3 text-sm break-words">
            {batch.error_message}
          </p>
        ) : null}
        <ol className="space-y-2">
          {batch.items.map((item) => (
            <li
              key={item.id}
              className="bg-background grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-[auto_auto_1fr] sm:items-start"
            >
              <span className="font-medium">Row {item.row_number}</span>
              <Badge variant="outline">{ITEM_STATUS_LABELS[item.status]}</Badge>
              <p className="text-muted-foreground min-w-0 break-words">
                {item.reason || "Waiting for an outcome."}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

export function SourceImportBatchList({
  batches,
  loading,
  error,
  onRetry,
}: SourceImportBatchListProps): React.ReactNode {
  return (
    <section className="space-y-3" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold tracking-wide uppercase">
            Recent source imports
          </h3>
        </div>
        <span className="text-muted-foreground text-xs">
          {batches.length} recent batch{batches.length === 1 ? "" : "es"}
        </span>
      </div>

      {loading ? (
        <Card className="bg-card/70">
          <CardContent className="text-muted-foreground p-5 text-sm">
            Loading source import history…
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-destructive/50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <AlertCircle
                className="text-destructive mt-0.5 size-5 shrink-0"
                aria-hidden="true"
              />
              <p className="text-sm break-words">{error}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onRetry()}
            >
              <RefreshCw className="size-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : batches.length === 0 ? (
        <Card className="bg-card/70 border-dashed">
          <CardContent className="text-muted-foreground p-5 text-sm">
            No source imports yet. Paste approved source-post JSON to create a
            reviewable batch.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {batches.map((batch, index) => (
              <BatchDetail key={batch.id} batch={batch} open={index === 0} />
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
