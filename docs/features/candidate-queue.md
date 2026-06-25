# Candidate Queue Feature

Candidate Queue turns the Queue tab into a local-first manual intake and triage surface for LinkedIn post candidates.

## Purpose

The queue stores:

- Manually added LinkedIn post URLs and content excerpts.
- Optional author/source metadata.
- Campaign-specific candidate records.
- Duplicate keys for normalized URL and content hash.
- Triage status: `new`, `shortlisted`, `rejected`, or `drafted`.
- Optional relevance score and scoring reason for future AI scoring.

No LinkedIn scraping, AI relevance scoring, draft generation, commenting, publishing, or scheduling happens in this slice.

## Schema

Migration: `src-tauri/src/migrations/candidate_queue.rs`.

Tables:

- `target_posts`
- `candidate_posts`
- `dedupe_keys`

Duplicate prevention is per campaign:

- `normalized_url` prevents adding the same LinkedIn source URL twice.
- `content_hash` prevents adding the same post text twice from a different URL.

See `docs/DATA_MODEL.md` for column-level details.

## Frontend contract

Types live in `src/features/candidate-queue/types/index.ts`.

Schemas live in `src/features/candidate-queue/schemas.ts` and use Zod 4.

Data functions live in `src/features/candidate-queue/data.ts`:

- `normalizeCandidateUrl(url)`
- `createContentHash(content)`
- `createCandidate(input)`
- `listCandidates(campaignId)`
- `updateCandidate(input)`
- `setCandidateStatus(id, status)`
- `deleteCandidate(id)`

`createCandidate` validates input, computes normalized URL/content hash, checks `dedupe_keys`, inserts or reuses a target post, creates the candidate, then stores both dedupe keys.

## UI

`CandidateQueueView` renders:

- Header and explanation that intake is manual and publishing remains gated.
- Campaign selector.
- `Add candidate` action.
- Loading and retry states.
- No-campaign and empty-queue states.
- Summary cards for total, shortlisted, rejected, and average score.
- Candidate cards grouped by status.

`AddCandidateDialog` captures URL, content, author metadata, posted-at text, source keyword, score, reason, and notes.

`CandidateCard` shows candidate source details and status actions:

- `Shortlist`
- `Reject`
- `Mark drafted`
- `Reset to new`
- `Delete`

## Verification

Run:

```bash
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
