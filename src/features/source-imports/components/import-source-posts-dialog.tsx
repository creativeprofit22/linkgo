import { FileInput } from "lucide-react";
import { useState, type SyntheticEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_SOURCE_IMPORT_ROWS,
  MAX_SOURCE_IMPORT_TEXT_LENGTH,
} from "@/features/source-imports/schemas";
import type {
  CreateSourceImportBatchInput,
  SourceImportBatchResult,
} from "@/features/source-imports/types";
import { toPlainMessage } from "@/lib/plain-message";

const SOURCE_IMPORT_EXAMPLE = `[
  {
    "url": "https://www.linkedin.com/posts/example",
    "content": "Post text",
    "authorName": "Jane Doe",
    "postedAt": "2026-07-20T14:30:00Z",
    "sourceKeyword": "founder content"
  }
]`;

interface ImportSourcePostsDialogProps {
  campaignId: number | null;
  onImport: (
    input: CreateSourceImportBatchInput,
  ) => Promise<SourceImportBatchResult>;
  pending?: boolean;
  disabled?: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? toPlainMessage(error.message)
    : "We couldn't import these posts. Please try again.";
}

function ResultSummary({
  result,
}: {
  result: SourceImportBatchResult;
}): React.ReactNode {
  return (
    <div
      className="bg-muted/40 space-y-2 rounded-lg border p-4 text-sm"
      aria-live="polite"
      data-testid="source-import-result"
    >
      <p className="font-medium">
        {result.status === "completed"
          ? "Import finished"
          : result.status === "failed"
            ? "Import stopped"
            : "Import finished. Some posts need a look"}
      </p>
      <p className="text-muted-foreground">
        {result.acceptedCount} added, {result.duplicateCount} already saved,{" "}
        {result.rejectedCount} skipped.
      </p>
      {result.errorMessage ? (
        <p className="text-destructive break-words">
          {toPlainMessage(result.errorMessage)}
        </p>
      ) : null}
    </div>
  );
}

export function ImportSourcePostsDialog({
  campaignId,
  onImport,
  pending = false,
  disabled = false,
}: ImportSourcePostsDialogProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SourceImportBatchResult | null>(null);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (pending) return;
    setOpen(nextOpen);
    if (!nextOpen && result !== null) {
      setResult(null);
      setError(null);
    }
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (campaignId === null || pending) return;

    setError(null);
    setResult(null);
    try {
      const importResult = await onImport({ campaignId, sourceText });
      setResult(importResult);
      setSourceText("");
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || campaignId === null}
        >
          <FileInput className="size-4" /> Import posts
        </Button>
      </DialogTrigger>
      <DialogContent className="source-import-dialog max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Import posts</DialogTitle>
            <DialogDescription>
              Paste a list of posts for this campaign. Each post is checked
              against your idea filters before Linkgo saves it as an idea.
              Linkgo doesn't contact LinkedIn to do this.
            </DialogDescription>
          </DialogHeader>

          {result === null ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="source-import-json">Posts (JSON)</Label>
                <p
                  id="source-import-help"
                  className="text-muted-foreground text-sm"
                >
                  Paste a JSON list of 1–{MAX_SOURCE_IMPORT_ROWS} posts, like
                  the example below. Each post needs a <code>url</code>, its{" "}
                  <code>content</code>, and a <code>postedAt</code> date and
                  time with a time zone. You can paste up to{" "}
                  {MAX_SOURCE_IMPORT_TEXT_LENGTH.toLocaleString("en-US")}{" "}
                  characters.
                </p>
                <pre className="bg-muted/40 max-w-full overflow-x-auto rounded-lg border p-3 text-xs leading-relaxed whitespace-pre-wrap">
                  <code className="break-all">{SOURCE_IMPORT_EXAMPLE}</code>
                </pre>
                <Textarea
                  id="source-import-json"
                  value={sourceText}
                  onChange={(event) => {
                    setSourceText(event.target.value);
                    setError(null);
                  }}
                  aria-invalid={error !== null}
                  aria-describedby={
                    error === null
                      ? "source-import-help"
                      : "source-import-help source-import-error"
                  }
                  maxLength={MAX_SOURCE_IMPORT_TEXT_LENGTH}
                  rows={10}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder={SOURCE_IMPORT_EXAMPLE}
                  className="min-h-52 font-mono text-xs"
                />
                {error === null ? null : (
                  <p
                    id="source-import-error"
                    role="alert"
                    className="text-destructive text-sm break-words"
                  >
                    {error}
                  </p>
                )}
              </div>

              <p className="text-muted-foreground text-xs">
                Posts that don't pass your idea filters (link, post age, blocked
                topics, or people you've already contacted) are skipped and not
                saved as ideas. Importing never uses AI, writes drafts,
                approves, comments, schedules, or posts.
              </p>
            </>
          ) : (
            <ResultSummary result={result} />
          )}

          <DialogFooter>
            {result === null ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    campaignId === null ||
                    sourceText.trim().length === 0
                  }
                >
                  {pending ? "Importing…" : "Import posts"}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
