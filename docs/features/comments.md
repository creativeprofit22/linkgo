# Comments

## Status

Implemented as a local-first Comments tab for approval-gated LinkedIn reply workflows.

## Purpose

The Comments slice lets operators draft, audit, review, and record manual LinkedIn comment outcomes against candidate target posts.

It is deliberately local and approval-gated.

Linkgo does not post comments through the LinkedIn API.

## Schema

Migration version `9` creates:

- `comment_threads`
- `comment_variants`
- `comment_audits`
- `comment_attempts`

`comment_threads` stores one workflow per candidate post.

`comment_variants` stores one to three manual reply drafts per thread.

`comment_audits` stores deterministic local findings for each variant.

`comment_attempts` stores manual posted/failed history for approved comments.

The first slice keeps one comment thread per candidate target through `UNIQUE(candidate_post_id)`.

## Data API

Public functions live in `src/features/comments/data.ts`:

- `auditCommentVariant(body)`
- `getCommentAuditSeverity(findings)`
- `listCommentThreads(campaignId?)`
- `listCommentEligibleCandidates(campaignId?)`
- `createCommentThread(input)`
- `updateCommentThread(input)`
- `updateCommentVariant(input)`
- `setCommentVariantStatus(input)`
- `setCommentThreadStatus(input)`
- `recordCommentAttempt(input)`

Inputs are validated in `src/features/comments/schemas.ts`.

The local comment body cap is 1,250 characters. This is a Linkgo conservative cap, not a verified LinkedIn API limit.

## Lifecycle

1. Candidate posts become eligible when their campaign is not archived, candidate status is `shortlisted` or `drafted`, and no comment thread already exists for that candidate.
2. Operator creates one to three reply variants manually.
3. Linkgo runs deterministic audits locally.
4. A clean selected variant can move to `needs_review`.
5. Reviewer approves, requests changes, rejects, cancels, or leaves it pending.
6. Only `approved` comments can record manual posting attempts.
7. Successful attempts move the thread to `posted`.
8. Failed attempts keep the thread approved/actionable and create an error queue item.

## Audit rules

Deterministic local rules check:

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
- Manual posted/failed attempt dialogs.
- Archived-campaign history with mutation actions blocked.

## Safety integration

Successful manual posted records enforce `campaigns.daily_comment_limit`.

Allowed and blocked decisions are stored in `rate_limit_events` with `action = 'comment'`.

The global kill switch hides the UI `Record posted` action and the data API blocks successful attempts.

Kill-switch comment blocks are recorded as blocked comment rate-limit events because the existing safety audit enum has no comment-specific event type.

Failed manual attempts create an open `error_queue_items` row with:

- `source_type = 'manual'`
- `source_id = comment_thread_id`
- `title = 'Comment attempt failed'`

## Explicit exclusions

This slice does not implement:

- LinkedIn OAuth.
- LinkedIn API comment posting.
- LinkedIn scraping.
- Background workers.
- Real AI provider calls.
- Automated comment generation or posting.

## Verification

Run:

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
