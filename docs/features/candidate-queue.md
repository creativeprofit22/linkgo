# Candidate Queue Feature

Candidate Queue turns the Queue tab into a local-first intake and triage surface for approved LinkedIn post candidates. Operators can add one attended manual override or import a bounded local JSON batch through the campaign policy gate.

## Purpose

The queue stores:

- Manually added LinkedIn post URLs and content excerpts.
- Source posts imported from local JSON arrays of 1–50 policy-enforced rows.
- Optional author/source metadata.
- Campaign-specific candidate records.
- Duplicate keys for normalized URL and content hash.
- Triage status: `new`, `shortlisted`, `rejected`, or `drafted`.
- Optional relevance score and scoring reason from manual entry or explicit scoring runs.
- Operator-triggered discovery suggestions for keywords, trends, and source prompts.

No LinkedIn scraping, autonomous draft generation, autonomous commenting, publishing, or scheduling happens during intake. Import only processes operator-supplied local data. Discovery saves suggestions only; scoring updates existing candidates only after an operator starts the run.

## Schema

Migrations: `src-tauri/src/migrations/candidate_queue.rs`, `src-tauri/src/migrations/candidate_discovery.rs`, `src-tauri/src/migrations/source_imports.rs`, and `src-tauri/src/migrations/candidate_policy.rs`.

Tables:

- `target_posts`
- `candidate_posts`
- `dedupe_keys`
- `candidate_discovery_items`
- `source_import_batches`
- `source_import_items`
- `candidate_intake_policies`
- `candidate_policy_banned_topics`

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

`createCandidate` validates input, computes normalized URL/content hash, checks `dedupe_keys`, inserts or reuses a target post, creates the candidate, then stores both dedupe keys in one transaction. It is the attended manual override and omits automatic policy enforcement. Source imports call the same transaction-safe insert helper with `{ enforcePolicy: true }`, so all four policy classes run before target, candidate, or dedupe writes. Future automated connectors must use this enforced option.

`runCandidateDiscovery` creates and starts a researcher agent run. The `research_posts` tool persists up to 25 validated suggestions and attaches agent/workflow provenance.

`scoreCandidates` creates and starts an attended scorer agent run. The `score_relevance` contract requires 1–50 unique candidate IDs and exactly one bounded score/rationale for every requested ID. Missing, duplicate, extra, or foreign score IDs fail before writes; no synthetic fallback score is fabricated.

`applyRelevanceScoresFromTool` calls a restricted native scoring command. That command pins `BEGIN IMMEDIATE` to one SQLx connection, rechecks campaign ownership plus `new`/unscored state for every candidate, and requires every update to affect one row. Scores and optional below-threshold rejection commit as one set or roll back completely. Planner-linked runs additionally require the tool IDs and policy to match the persisted approved context; see `docs/features/relevance-scoring.md`.

## UI

`CandidateQueueView` renders:

- Header and explanation that intake, discovery, and scoring are operator-triggered while external actions remain gated.
- Campaign selector.
- Candidate intake policy summary and accessible editor, including archived read-only state and manual-override disclosure.
- `Run discovery`, `Score candidates`, `Import source posts`, and `Add candidate` actions.
- Loading and retry states.
- No-campaign and empty-queue states.
- Summary cards for total candidates, suggestions, scored candidates, shortlisted candidates, and average score.
- Discovery suggestion cards with promote/dismiss actions.
- Recent source import batches with accepted, duplicate, and rejected item reasons.
- Candidate cards grouped by status.

`ImportSourcePostsDialog` accepts bounded local JSON, preserves text after validation errors, and reports batch totals without closing immediately. Import mutations are disabled for archived campaigns while history stays visible. See `docs/features/source-imports.md` for the format and lifecycle.

`AddCandidateDialog` captures URL, content, author metadata, posted-at text, source keyword, score, reason, and notes. It remains an explicitly attended override for historical or exceptional material.

`CandidateCard` shows candidate source details and status actions:

- `Shortlist`
- `Reject`
- `Mark drafted`
- `Reset to new`
- `Delete`

## Verification

Run:

```bash
bunx playwright test tests/candidate-policy.spec.ts tests/source-imports.spec.ts tests/candidate-queue.spec.ts
bun run format:check
bun run lint
bun run build
bun run test
bun run test:rust
```
