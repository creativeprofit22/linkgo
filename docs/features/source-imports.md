# Source Imports

## Status

Roadmap 3A is implemented as a bounded local source-post import boundary for the existing Candidate Queue. Roadmap 3 remains partial and next: policy guardrails, recurring backlog work, autopilot planning, and a compliant production source connector are still required.

## Purpose

Source import lets an operator paste approved post metadata into Linkgo without pretending that Linkgo can search or fetch arbitrary LinkedIn posts. Valid rows enter the same candidate normalization and dedupe path as manual intake. Every supplied row receives a durable, reviewable outcome.

Import is local only. It does not scrape LinkedIn, use browser automation, call a model provider, run discovery, draft content, create approvals, comment, schedule, or publish.

## JSON format

Paste a JSON array with 1–50 objects:

```json
[
  {
    "url": "https://www.linkedin.com/posts/example",
    "content": "Post text or a useful excerpt",
    "authorName": "Jane Doe",
    "authorProfileUrl": "https://www.linkedin.com/in/jane-doe",
    "postedAt": "2026-07-27T10:00:00Z",
    "platformResourceUrn": "urn:li:activity:123",
    "sourceKeyword": "founder content",
    "notes": "Approved local source"
  }
]
```

Required fields:

- `url`: non-empty, at most 1,000 characters.
- `content`: non-empty, at most 3,000 characters.

Optional fields reuse Candidate Queue limits:

- `authorName`: 160 characters.
- `authorProfileUrl`: 1,000 characters.
- `postedAt`: string or `null`, 80 characters.
- `platformResourceUrn`: 500 characters.
- `sourceKeyword`: 80 characters.
- `notes`: 1,000 characters.

Unknown fields are rejected and not retained. Source text is capped at 400,000 characters, while each stored row audit is capped at 20,000 characters. File-system access and CSV parsing are not part of Roadmap 3A.

## Lifecycle

1. The source text must be valid JSON and a non-empty array with at most 50 rows.
2. The campaign must exist and must not be archived. This check happens before a batch or candidate is written.
3. Linkgo creates one `source_import_batches` row and one bounded `source_import_items` row for every supplied row.
4. Rows are processed sequentially.
5. Invalid rows become `rejected` with field-specific safe reasons; valid neighboring rows continue.
6. Valid rows use the Candidate Queue's validated insert helper, normalized URL, content hash, target-post reuse, candidate insert, and both dedupe keys in one row transaction.
7. Existing URL or content collisions become `duplicate`, not fatal errors.
8. Any processing or outcome-write failure after the initial commit enters one centralized terminalization path. The current row and every remaining `pending` row become `rejected`, the batch becomes `failed`, and earlier durable outcomes are preserved.
9. History loading treats a `processing` batch from a previous app session as interrupted because this synchronous slice has no resumable worker. It atomically rejects its remaining `pending` items and marks the batch `failed` before returning history.
10. An in-memory campaign import is registered before its initial batch commit and unregistered only after completion or terminalization. History loading never applies interrupted-session recovery while that campaign import is active.

Batch status is truthful:

- `processing`: transient state for an import active in the current app session.
- `completed`: every row was accepted.
- `completed_with_errors`: at least one row was duplicate or rejected.
- `failed`: local processing stopped, an outcome could not be stored normally, or a previous app session ended before processing finished.

Item status is `pending`, `accepted`, `duplicate`, or `rejected`. `pending` is transient while the current app session owns the import; interrupted items are recovered to `rejected` on the next history load.

## Data model and retention

Migration 22 creates:

- `source_import_batches`
- `source_import_items`

Campaign deletion cascades through batches to items. Candidate deletion uses `ON DELETE SET NULL`, preserving the import audit outcome while clearing its candidate link. Linkgo retains the ten most recent batches in the Queue view; the SQLite records remain local until their campaign is deleted.

`input_json` is always valid JSON at or below 20,000 characters. Object audits contain only bounded documented source-post fields. Oversized object, array, or scalar audits use a deterministic envelope with the original JSON type, original serialized length, and the largest safe serialized prefix; `null` remains `null`. OAuth credentials, provider keys, unknown object fields, and remote response payloads are not accepted or retained.

See `docs/DATA_MODEL.md` for column constraints and indexes.

## Data API

`src/features/source-imports/data.ts` exports:

- `createSourceImportBatch(input)`
- `listSourceImportBatches(campaignId)`

`createSourceImportBatch` parses the bounded source text, checks campaign eligibility, persists the batch/items, and returns accepted, duplicate, and rejected totals. It makes no external request.

`listSourceImportBatches` first terminalizes every interrupted `processing` batch for the campaign when no in-memory import owns that campaign, then returns up to ten recent batches with item outcomes ordered by row number. Recovery is transactional and retryable: if recovery storage fails, the history request fails instead of presenting stale processing as live work.

## UI

The Candidate Queue adds:

- `Import source posts` beside discovery, scoring, and manual add actions.
- A labeled JSON textarea with format example and limits.
- Local-only and no-scraping safety copy.
- Preserved input after validation errors.
- Pending protection against duplicate submission.
- An `aria-live="polite"` completion summary.
- Recent batch history with item status and wrapped reasons.
- Disabled import mutation for archived campaigns while history remains visible.

The existing Radix Dialog primitive manages modal focus, Escape, and trigger focus return. Actions use native buttons and the existing Linkgo Card, Button, Textarea, Badge, Sonner, and Lucide system.

## Safety and exclusions

Roadmap 3A does not add:

- LinkedIn post search, arbitrary feed retrieval, scraping, or browser automation.
- A production remote source connector.
- Recurring campaign planning, cron behavior, or autopilot execution.
- Provider calls, workflow runs, draft generation, approvals, comments, schedules, or publishing.
- Credentials, OAuth data, CSV parsing, or file-system import.

Remote connectors require separately verified API permissions, terms, and product access. Publishing and commenting remain human approval-gated regardless of candidate source.

## Verification

Run:

```bash
bunx playwright test tests/source-imports.spec.ts
bun run test:rust
bun run format:check
bun run lint
bun run build
bun run check
```

Performance remains unverified without a measured profile. Input, row count, SQLite fields, history query count, and visible batch count are bounded to prevent unbounded renderer or database work.
