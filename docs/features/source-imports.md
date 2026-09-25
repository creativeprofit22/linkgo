# Source Imports

## Status

Roadmaps 3A, 3B, and the Roadmap 3D planner boundary are implemented. Source Imports is the bounded, policy-enforced connector intake boundary. Roadmap 3 remains partial and blocked only on one compliant production source connector.

## Purpose

Source import lets an operator paste approved post metadata into Linkgo without pretending that Linkgo can search or fetch arbitrary LinkedIn posts. Rows must pass the selected campaign's source, age, banned-topic, and prior-contact policy before entering the shared candidate normalization and dedupe path. Every supplied row receives a durable, reviewable outcome.

Import is local only. It does not scrape LinkedIn, use browser automation, call a model provider, run discovery, draft content, create approvals, comment, schedule, or publish. A completed batch can later be consumed by the opt-in local planner, which creates only linked backlog/workflow records.

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

Required for enforced intake:

- `url`: non-empty, at most 1,000 characters, and an HTTPS LinkedIn URL.
- `content`: non-empty, at most 3,000 characters.
- `postedAt`: absolute ISO-8601 timestamp with a timezone, at most 80 characters.

Optional fields reuse Candidate Queue limits:

- `authorName`: 160 characters.
- `authorProfileUrl`: 1,000 characters.
- `platformResourceUrn`: 500 characters.
- `sourceKeyword`: 80 characters.
- `notes`: 1,000 characters.

Unknown fields are rejected and not retained. Source text is capped at 400,000 characters, while each stored row audit is capped at 20,000 characters. File-system access and CSV parsing are not part of Roadmap 3A.

## Lifecycle

1. The source text must be valid JSON and a non-empty array with at most 50 rows.
2. The campaign must exist and must not be archived. This check happens before a batch or candidate is written.
3. Linkgo creates one `source_import_batches` row and one bounded `source_import_items` row for every supplied row.
4. Rows are processed sequentially.
5. Structurally invalid rows become `rejected` with field-specific safe reasons; valid neighboring rows continue.
6. Structurally valid rows call the shared candidate insert helper with policy enforcement enabled. Source, age, banned-topic, and prior-contact checks run before candidate artifacts are written.
7. Policy blocks become `rejected`, persist their first `policy_rule_key` plus all bounded finding messages, and do not create target, candidate, or dedupe records.
8. Accepted policy rows continue through normalized URL, content hash, target-post reuse, candidate insert, and both dedupe keys in one row transaction.
9. Existing URL or content collisions become `duplicate`, not fatal errors.
10. Any processing or outcome-write failure after the initial commit enters one centralized terminalization path. The current row and every remaining `pending` row become `rejected`, the batch becomes `failed`, and earlier durable outcomes are preserved.
11. History loading treats a `processing` batch from a previous app session as interrupted because this synchronous slice has no resumable worker. It atomically rejects its remaining `pending` items and marks the batch `failed` before returning history.
12. An in-memory campaign import is registered before its initial batch commit and unregistered only after completion or terminalization. History loading never applies interrupted-session recovery while that campaign import is active.

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

Migration 23 adds `source_import_items.policy_rule_key` with `source`, `age`, `banned_topic`, and `already_contacted` classifications. Empty means the outcome was not a policy block.

Campaign deletion cascades through batches to items. Candidate deletion uses `ON DELETE SET NULL`, preserving the import audit outcome while clearing its candidate link. Linkgo retains the ten most recent batches in the Queue view; the SQLite records remain local until their campaign is deleted.

`input_json` is always valid JSON at or below 20,000 characters. Object audits contain only bounded documented source-post fields. Oversized object, array, or scalar audits use a deterministic envelope with the original JSON type, original serialized length, and the largest safe serialized prefix; `null` remains `null`. OAuth credentials, provider keys, unknown object fields, and remote response payloads are not accepted or retained.

See `docs/DATA_MODEL.md` for column constraints and indexes.

## Data API

`src/features/source-imports/data.ts` exports:

- `createSourceImportBatch(input)`
- `listSourceImportBatches(campaignId)`

`createSourceImportBatch` parses the bounded local text into the `local_json` connector contract, then invokes the native `linkgo_source_import_write_batch` command (`src-tauri/src/source_imports.rs`). Native re-validates the rows (connector, 1–50 rows numbered in order, bounded audit JSON and reasons, unknown fields rejected), enforces the candidate intake policy natively, and settles each row with its item outcome in one pinned `BEGIN IMMEDIATE` transaction. It checks campaign eligibility, persists batch/items, and returns accepted, duplicate, and rejected totals. Public behavior is unchanged and it makes no external request.

`listSourceImportBatches` first calls `linkgo_source_import_recover_interrupted`, which terminalizes every interrupted `processing` batch for the campaign when no in-flight native import owns it (the check runs after the recovery transaction holds the write lock), then calls `linkgo_source_import_dashboard` (`src-tauri/src/source_import_reads.rs`), which returns up to ten recent batches with item outcomes ordered by row number (at most 50 items per batch), read in one transaction. Response shapes are checked by the strict schemas in `src/features/source-imports/record-schemas.ts`, which is kept out of the feature's UI/type import cycle. The renderer has no direct SQL access to source-import tables. Recovery is transactional and retryable: if recovery storage fails, the history request fails instead of presenting stale processing as live work.

## UI

The Candidate Queue adds:

- `Import source posts` beside discovery, scoring, and manual add actions.
- A labeled JSON textarea with format example and limits.
- Local-only and no-scraping safety copy.
- Preserved input after validation errors.
- Pending protection against duplicate submission.
- An `aria-live="polite"` completion summary.
- Recent batch history with item status, plain-text policy classification, and wrapped exact reasons.
- Disabled import mutation for archived campaigns while history remains visible.

The existing Radix Dialog primitive manages modal focus, Escape, and trigger focus return. Actions use native buttons and the existing Linkgo Card, Button, Textarea, Badge, Sonner, and Lucide system.

## Safety and exclusions

The source boundary and local planner do not add:

- LinkedIn post search, arbitrary feed retrieval, scraping, or browser automation.
- A production remote source connector.
- Provider calls, workflow executor runs, draft generation, approvals, comments, schedules, or publishing.
- Credentials, OAuth data, CSV parsing, or file-system import.
- After-quit planner work.

`src/features/source-imports/connectors.ts` registers only `local_json`, labels it local/operator-supplied, and marks external fetching as forbidden. The planner consumes terminal batches by connector key rather than connector-specific code. Remote connectors require separately verified API permissions, terms, product access, and a migration expanding the database constraint. Publishing and commenting remain human approval-gated regardless of candidate source.

## Verification

Run:

```bash
bunx playwright test tests/candidate-policy.spec.ts tests/source-imports.spec.ts tests/candidate-queue.spec.ts
bun run test:rust
bun run format:check
bun run lint
bun run build
bun run check
```

Performance remains unverified without a measured profile. Input, row count, SQLite fields, history query count, and visible batch count are bounded to prevent unbounded renderer or database work.
