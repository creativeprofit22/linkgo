# Drafting + Audit Feature

Drafting + Audit turns the Drafts tab into a local-first manual workspace for LinkedIn post variants and deterministic review checks.

## Purpose

The feature stores:

- One draft workspace per candidate post.
- One to five operator-written draft variants.
- Deterministic audit findings for each variant.
- Variant status: `draft`, `selected`, or `rejected`.
- Draft status: `drafting`, `needs_revision`, `ready_for_review`, or `archived`.

Creating a draft marks the source candidate as `drafted` in the Candidate Queue.

No AI generation, AI audit loops, LinkedIn scraping, approval records, scheduling, publishing, or comment automation happens in this slice.

## Schema

Migration: `src-tauri/src/migrations/drafts.rs`.

Tables:

- `drafts`
- `draft_variants`
- `draft_audits`

Key constraints:

- `drafts.candidate_post_id` is unique so one candidate has one active local draft workspace.
- `draft_variants` allows variant numbers `1` through `5` and keeps them unique per draft.
- `draft_audits.severity` is limited to `pass`, `warning`, or `block`.
- All draft tables cascade when their campaign or candidate source is deleted.

See `docs/DATA_MODEL.md` for column-level details.

## Frontend contract

Types live in `src/features/drafts/types/index.ts`.

Schemas live in `src/features/drafts/schemas.ts` and use Zod 4.

Data functions live in `src/features/drafts/data.ts`:

- `auditDraftVariant(input)`
- `createDraft(input)`
- `listDrafts(campaignId)`
- `updateDraft(input)`
- `updateDraftVariant(input)`
- `setDraftVariantStatus(input)`
- `archiveDraft(id)`

`createDraft` validates the candidate, rejects archived campaigns, rejected candidates, and candidates that already have a draft, inserts the draft and variants in a transaction, writes audit rows, and updates `candidate_posts.status` to `drafted`.

`updateDraftVariant` updates only provided fields, deletes old audit rows, writes fresh deterministic audit rows, and updates the parent draft timestamp.

## Deterministic audit rules

The local audit records blockers and warnings without calling a model:

- `required_text`: blocks variants with no hook and no body.
- `total_length`: blocks variants over 3,000 combined characters.
- `external_link`: blocks links in hook, body, or CTA.
- `hashtag_limit`: blocks more than five parsed hashtags.
- `weak_hook`: warns for short or generic hooks.
- `specificity`: warns when the text lacks a number and first-person signal.

The UI shows passing findings for hard blockers so operators can see why a variant is safe enough to review.

## UI

`DraftsView` renders:

- Header explaining this is manual and local deterministic audit only.
- Campaign selector.
- `Create draft` action.
- Loading, retry, no-campaign, and empty-draft states.
- Summary cards for total drafts, ready-for-review drafts, blocked variants, and selected variants.
- Draft cards with candidate source context and variant cards.

`AddDraftDialog` captures candidate, angle, notes, and one to five manual variants. It excludes rejected and already-drafted candidates, and disables draft creation for archived campaigns so the UI matches the `createDraft` data guard.

`DraftVariantCard` supports:

- Reviewing hook, body, CTA, and hashtags.
- Seeing audit severity and finding messages.
- Editing a variant and re-running audit.
- Selecting one clean variant for review.
- Rejecting or resetting a variant.

Selecting a blocked variant is rejected by the data API with `Blocked variants cannot be selected`.

## Verification

Run:

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
