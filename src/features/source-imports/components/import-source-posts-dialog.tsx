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
  return error instanceof Error ? error.message : "Source import failed";
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
          ? "Import completed"
          : result.status === "failed"
            ? "Import stopped"
            : "Import completed with review items"}
      </p>
      <p className="text-muted-foreground">
        {result.acceptedCount} accepted, {result.duplicateCount} duplicate,{" "}
        {result.rejectedCount} rejected.
      </p>
      {result.errorMessage ? (
        <p className="text-destructive break-words">{result.errorMessage}</p>
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
          <FileInput className="size-4" /> Import source posts
        </Button>
      </DialogTrigger>
      <DialogContent className="source-import-dialog max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Import source posts</DialogTitle>
            <DialogDescription>
              Paste approved source-post data for this campaign. Every row is
              checked against the selected campaign policy before candidate data
              is stored. Import stays local and does not request LinkedIn data.
            </DialogDescription>
          </DialogHeader>

          {result === null ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="source-import-json">Source posts JSON</Label>
                <p
                  id="source-import-help"
                  className="text-muted-foreground text-sm"
                >
                  Use a JSON array with 1–{MAX_SOURCE_IMPORT_ROWS} rows. Each
                  row requires <code>url</code>, <code>content</code>, and an
                  absolute <code>postedAt</code> timestamp with a timezone.
                  Maximum source size is{" "}
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
                Rows that fail source, age, banned-topic, or prior-contact rules
                are recorded as rejected without candidate artifacts. Import
                does not call a model, draft, approve, comment, schedule, or
                publish.
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
