# Comments

## Status

Implemented as a local-first Comments tab for approval-gated LinkedIn reply workflows.

## Purpose

The Comments slice lets operators draft, audit, review, post, and record LinkedIn comment outcomes against candidate target posts.

It is deliberately human approval-gated.

Linkgo posts comments only after explicit approval and confirmation when LinkedIn Community Management access is available.

## Schema

Migration version `9` creates:

- `comment_threads`
- `comment_variants`
- `comment_audits`
- `comment_attempts`

`comment_threads` stores one workflow per candidate post.

`comment_variants` stores one to three manual reply drafts per thread.

`comment_audits` stores deterministic local findings for each variant.

`comment_attempts` stores posted/failed history for approved comments.

Migration version `13` adds API-posting metadata: `target_posts.platform_resource_urn`, `comment_attempts.idempotency_key`, and supporting indexes.

The first slice keeps one comment thread per candidate target through `UNIQUE(candidate_post_id)`.

## Data API

Public functions live in `src/features/comments/data.ts`:

- `getCommentAuditSeverity(findings)`
- `listCommentThreads(campaignId?)`
- `listCommentEligibleCandidates(campaignId?)`
- `createCommentThread(input)`
- `updateCommentThread(input)`
- `updateCommentVariant(input)`
- `setCommentVariantStatus(input)`
- `setCommentThreadStatus(input)`
- `assertCommentCanPublishViaLinkedIn(input)`
- `recordCommentAttempt(input)`

Inputs are validated in `src/features/comments/schemas.ts`.

The five mutations and the publish gate are native commands in `src-tauri/src/comment_threads.rs`: `linkgo_comment_thread_create`, `linkgo_comment_thread_update`, `linkgo_comment_variant_update`, `linkgo_comment_variant_set_status`, `linkgo_comment_thread_set_status` (each returns `{ id }`) and `linkgo_comment_assert_can_publish`. Each re-reads the thread, variant and campaign and writes on one pinned `BEGIN IMMEDIATE` connection, so any failure rolls back every row. Inputs reject unknown fields. The publish gate compares `commentary` with the escaped selected variant byte-for-byte, re-resolves the target URN and requires the `comment-thread:{id}:linkedin:` idempotency prefix. Kill-switch and daily-limit rejections still commit their blocked rate-limit event. Real-SQLite tests: `src-tauri/src/comment_threads_tests.rs`.

Reads are native too (`src-tauri/src/comment_reads.rs`); the renderer has no direct SQL access to comment tables.

- `linkgo_comment_thread_list` returns up to 500 threads, open ones first, with their variants, audits and attempts, plus `totalCount` (threads matching the filter before the cap), all read in one transaction. `listCommentThreadPage` returns `{ items, totalCount }`; `listCommentThreads` returns only the items. When truncated, the Comments screen shows "Showing the first 500 of N", uses `totalCount` for Total, and labels status counts as covering the shown rows.
- `linkgo_comment_eligible_candidates` returns up to 200 shortlisted or drafted candidates that have no thread yet.

Response shapes are checked by strict schemas in `src/features/comments/record-schemas.ts`. Tests: `src-tauri/src/comment_reads_tests.rs`.

The local comment body cap is 1,250 characters. This is a Linkgo conservative cap, not a verified LinkedIn API limit.

## Lifecycle

1. Candidate posts become eligible when their campaign is not archived, candidate status is `shortlisted` or `drafted`, and no comment thread already exists for that candidate.
2. Operator creates one to three reply variants manually.
3. Linkgo runs deterministic audits locally.
4. A clean selected variant can move to `needs_review`.
5. Reviewer approves, requests changes, rejects, cancels, or leaves it pending.
6. Only `approved` comments can post via LinkedIn API or record manual posting attempts.
7. API posting requires a resolvable LinkedIn target URN and exact `Post comment` confirmation.
8. Successful attempts move the thread to `posted`.
9. Failed attempts keep the thread approved/actionable and create an error queue item.

## Audit rules

Audit findings are computed natively (`src-tauri/src/comment_audit.rs`) whenever a variant is created or its body changes, so the renderer cannot supply its own findings. The port keeps the old renderer semantics: length counts UTF-16 units, and `\b` and digits are ASCII-only. Deterministic rules check:

- Required non-empty body.
- Linkgo 1,250-character cap.
- External links (`http://`, `https://`, `www.`) as blockers.
- More than two hashtags as blockers.
- More than one mention as a warning.
- Generic or very short replies as warnings.
- Missing specificity signals as warnings.

Specificity passes when a body includes a number, a quoted phrase, or a first-person signal.

## UI

The Comments tab includes:

- Campaign selector.
- Create comment dialog with eligible candidate target context.
- Summary cards for total, needs review, approved, and posted.
- Thread cards grouped by actionable status first.
- Variant cards with raw body, escaped LinkedIn LittleText preview, audit status, edit, select, reject, and reset actions.
- Review actions for submit, approve, request changes, reject, and cancel.
- `Post via LinkedIn` confirmation dialog for approved comments with resolvable target URNs.
- Manual posted/failed attempt dialogs as fallback.
- Archived-campaign history with mutation actions blocked.

## Safety integration

Successful API and manual posted records enforce `campaigns.daily_comment_limit`.

Allowed and blocked decisions are stored in `rate_limit_events` with `action = 'comment'`.

The global kill switch hides the UI `Post via LinkedIn` action and the data API blocks successful API/manual successes.

Kill-switch comment blocks are recorded as blocked comment rate-limit events because the existing safety audit enum has no comment-specific event type.

Failed API and manual attempts create an open `error_queue_items` row with:

- `source_type = 'manual'`
- `source_id = comment_thread_id`
- `title = 'Comment attempt failed'`

## Explicit exclusions

This slice does not implement:

- Autonomous LinkedIn commenting.
- LinkedIn scraping.
- Background comment workers.
- Mentions, images, nested comments, or API comment reads.
- Real AI provider calls for automated comment generation.

## Verification

Run:

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
