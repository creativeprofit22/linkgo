import { FileInput, Plus, Trash2 } from "lucide-react";
import { useRef, useState, type SyntheticEvent } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_SOURCE_IMPORT_ROWS } from "@/features/source-imports/schemas";
import type {
  CreateSourceImportBatchInput,
  SourceImportBatchResult,
  SourceImportFormRow,
} from "@/features/source-imports/types";
import { toPlainErrorMessage, toPlainMessage } from "@/lib/plain-message";

interface DraftRow extends SourceImportFormRow {
  key: number;
}

function emptyRow(key: number): DraftRow {
  return {
    key,
    url: "",
    content: "",
    postedAt: "",
    authorName: "",
    authorProfileUrl: "",
    sourceKeyword: "",
  };
}

function isBlankRow(row: DraftRow): boolean {
  return (
    row.url.trim() === "" &&
    row.content.trim() === "" &&
    row.postedAt.trim() === "" &&
    row.authorName.trim() === "" &&
    row.authorProfileUrl.trim() === "" &&
    row.sourceKeyword.trim() === ""
  );
}

function toFormRow(row: DraftRow): SourceImportFormRow {
  return {
    url: row.url,
    content: row.content,
    postedAt: row.postedAt,
    authorName: row.authorName,
    authorProfileUrl: row.authorProfileUrl,
    sourceKeyword: row.sourceKeyword,
  };
}

interface ImportSourcePostsDialogProps {
  campaignId: number | null;
  onImport: (
    input: CreateSourceImportBatchInput,
  ) => Promise<SourceImportBatchResult>;
  pending?: boolean;
  disabled?: boolean;
}

function getErrorMessage(error: unknown): string {
  return toPlainErrorMessage(
    error,
    "We couldn't import these posts. Please try again.",
  );
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

/**
 * Guided import: one small form per post (link, text, date, optional author
 * details). Rows feed the normalized import contract unchanged; nothing is
 * fetched from LinkedIn.
 */
export function ImportSourcePostsDialog({
  campaignId,
  onImport,
  pending = false,
  disabled = false,
}: ImportSourcePostsDialogProps): React.ReactNode {
  const nextKey = useRef(1);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>(() => [emptyRow(0)]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SourceImportBatchResult | null>(null);

  const takeKey = (): number => {
    const key = nextKey.current;
    nextKey.current += 1;
    return key;
  };

  const focusRowLink = (key: number): void => {
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLInputElement>(`#source-import-url-${key}`)
        ?.focus();
    });
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (pending) return;
    setOpen(nextOpen);
    if (!nextOpen && result !== null) {
      setResult(null);
      setError(null);
    }
  };

  const updateRow = (
    key: number,
    field: keyof SourceImportFormRow,
    value: string,
  ): void => {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, [field]: value } : row,
      ),
    );
    setError(null);
  };

  const addRow = (): void => {
    if (rows.length >= MAX_SOURCE_IMPORT_ROWS) return;
    const key = takeKey();
    setRows((current) => [...current, emptyRow(key)]);
    focusRowLink(key);
  };

  const removeRow = (key: number): void => {
    const index = rows.findIndex((row) => row.key === key);
    const remaining = rows.filter((row) => row.key !== key);
    setRows(remaining);
    const neighbour = remaining[Math.max(0, index - 1)];
    if (neighbour !== undefined) focusRowLink(neighbour.key);
  };

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (campaignId === null || pending) return;

    const filledRows = rows.filter((row) => !isBlankRow(row));
    if (filledRows.length === 0) {
      setError("Add the link and text of at least one post.");
      return;
    }

    setError(null);
    setResult(null);
    try {
      const importResult = await onImport({
        campaignId,
        rows: filledRows.map(toFormRow),
      });
      setResult(importResult);
      setRows([emptyRow(takeKey())]);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  };

  const atRowLimit = rows.length >= MAX_SOURCE_IMPORT_ROWS;

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
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Import posts</DialogTitle>
            <DialogDescription>
              Add LinkedIn posts you found for this campaign: the link and what
              the post says. Each post is checked against your idea filters
              before Linkgo saves it as an idea. Linkgo doesn&apos;t contact
              LinkedIn to do this.
            </DialogDescription>
          </DialogHeader>

          {result === null ? (
            <>
              <ol className="space-y-4" aria-label="Posts to import">
                {rows.map((row, index) => (
                  <li key={row.key}>
                    <SourceImportRowFields
                      row={row}
                      position={index + 1}
                      canRemove={rows.length > 1}
                      onChange={updateRow}
                      onRemove={removeRow}
                    />
                  </li>
                ))}
              </ol>

              <div className="space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRow}
                  disabled={atRowLimit || pending}
                  aria-describedby={
                    atRowLimit ? "source-import-row-limit" : undefined
                  }
                >
                  <Plus className="size-4" /> Add another post
                </Button>
                {atRowLimit ? (
                  <p
                    id="source-import-row-limit"
                    className="text-muted-foreground text-xs"
                  >
                    You can import up to {MAX_SOURCE_IMPORT_ROWS} posts at a
                    time. Import these, then add more.
                  </p>
                ) : null}
              </div>

              {error === null ? null : (
                <p
                  id="source-import-error"
                  role="alert"
                  className="text-destructive text-sm break-words"
                >
                  {error}
                </p>
              )}

              <p className="text-muted-foreground text-xs">
                Posts that don&apos;t pass your idea filters (link, post age,
                blocked topics, or people you&apos;ve already contacted) are
                skipped and not saved as ideas. Importing never uses AI, writes
                drafts, approves, comments, schedules, or posts.
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
                <Button type="submit" disabled={pending || campaignId === null}>
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

interface SourceImportRowFieldsProps {
  row: DraftRow;
  position: number;
  canRemove: boolean;
  onChange: (
    key: number,
    field: keyof SourceImportFormRow,
    value: string,
  ) => void;
  onRemove: (key: number) => void;
}

function SourceImportRowFields({
  row,
  position,
  canRemove,
  onChange,
  onRemove,
}: SourceImportRowFieldsProps): React.ReactNode {
  const id = (field: string): string => `source-import-${field}-${row.key}`;
  return (
    <fieldset
      className="space-y-3 rounded-lg border p-3"
      data-testid="source-import-row"
    >
      <legend className="sr-only">Post {position}</legend>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium" aria-hidden="true">
          Post {position}
        </p>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(row.key)}
            aria-label={`Remove post ${position}`}
          >
            <Trash2 className="size-4" /> Remove
          </Button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("url")}>Link</Label>
        <Input
          id={id("url")}
          inputMode="url"
          value={row.url}
          maxLength={1000}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://www.linkedin.com/posts/…"
          aria-describedby={id("url-hint")}
          onChange={(event) => onChange(row.key, "url", event.target.value)}
        />
        <p id={id("url-hint")} className="text-muted-foreground text-xs">
          On LinkedIn, open the post&apos;s ⋯ menu and choose &quot;Copy link to
          post&quot;.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("content")}>Post text</Label>
        <Textarea
          id={id("content")}
          value={row.content}
          maxLength={3000}
          rows={4}
          placeholder="Paste what the post says"
          onChange={(event) => onChange(row.key, "content", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("posted-at")}>Post date</Label>
        <Input
          id={id("posted-at")}
          type="datetime-local"
          value={row.postedAt}
          aria-describedby={id("posted-at-hint")}
          onChange={(event) =>
            onChange(row.key, "postedAt", event.target.value)
          }
        />
        <p id={id("posted-at-hint")} className="text-muted-foreground text-xs">
          When it was posted, in your time. Posts older than your idea filters
          allow are skipped.
        </p>
      </div>

      <details>
        <summary className="focus-visible:ring-ring text-muted-foreground inline-flex min-h-8 cursor-pointer items-center rounded-sm px-1 text-sm font-medium outline-none select-none hover:underline focus-visible:ring-2">
          More details (optional)
        </summary>
        <div className="mt-2 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={id("author-name")}>Author name</Label>
            <Input
              id={id("author-name")}
              value={row.authorName}
              maxLength={160}
              onChange={(event) =>
                onChange(row.key, "authorName", event.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("author-profile")}>Author profile link</Label>
            <Input
              id={id("author-profile")}
              inputMode="url"
              value={row.authorProfileUrl}
              maxLength={1000}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://www.linkedin.com/in/…"
              onChange={(event) =>
                onChange(row.key, "authorProfileUrl", event.target.value)
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("keyword")}>Where you found it</Label>
            <Input
              id={id("keyword")}
              value={row.sourceKeyword}
              maxLength={80}
              placeholder="e.g. founder content search"
              onChange={(event) =>
                onChange(row.key, "sourceKeyword", event.target.value)
              }
            />
          </div>
        </div>
      </details>
    </fieldset>
  );
}
