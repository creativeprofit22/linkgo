# Candidate Queue Feature

Candidate Queue turns the Queue tab into a local-first manual intake and triage surface for LinkedIn post candidates.

## Purpose

The queue stores:

- Manually added LinkedIn post URLs and content excerpts.
- Optional author/source metadata.
- Campaign-specific candidate records.
- Duplicate keys for normalized URL and content hash.
- Triage status: `new`, `shortlisted`, `rejected`, or `drafted`.
- Optional relevance score and scoring reason from manual entry or explicit scoring runs.
- Operator-triggered discovery suggestions for keywords, trends, and source prompts.

No LinkedIn scraping, autonomous draft generation, autonomous commenting, publishing, or scheduling happens in this slice. Discovery saves suggestions only; scoring updates existing manually-added candidates only after an operator starts the run.

## Schema

Migrations: `src-tauri/src/migrations/candidate_queue.rs` and `src-tauri/src/migrations/candidate_discovery.rs`.

Tables:

- `target_posts`
- `candidate_posts`
- `dedupe_keys`
- `candidate_discovery_items`
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
- `listDiscoveryItems(campaignId)`
- `runCandidateDiscovery(input)`
- `scoreCandidates(input)`
- `promoteDiscoveryItem(input)`
- `dismissDiscoveryItem(input)`

`createCandidate` validates input, computes normalized URL/content hash, checks `dedupe_keys`, inserts or reuses a target post, creates the candidate, then stores both dedupe keys.

`runCandidateDiscovery` creates and starts a researcher agent run. The `research_posts` tool persists up to 25 validated suggestions and attaches agent/workflow provenance.

`scoreCandidates` creates and starts a scorer agent run. The `score_relevance` tool applies only validated scores for candidates in the selected campaign, and optional auto-reject only changes candidates still in `new`.

## UI

`CandidateQueueView` renders:

- Header and explanation that discovery/scoring are operator-triggered and publishing remains gated.
- Campaign selector.
- `Run discovery`, `Score candidates`, and `Add candidate` actions.
- Loading and retry states.
- No-campaign and empty-queue states.
- Summary cards for total candidates, suggestions, scored candidates, shortlisted candidates, and average score.
- Discovery suggestion cards with promote/dismiss actions.
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
