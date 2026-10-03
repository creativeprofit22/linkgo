# Candidate Queue Feature

Candidate Queue turns the Ideas tab into a local-first intake and triage surface for approved LinkedIn post candidates. Operators can add one attended manual override or import a bounded local JSON batch through the campaign policy gate.

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

URL normalization and content hashing are native: `normalize_candidate_url` in `src-tauri/src/js_url.rs` and `content_hash` in `src-tauri/src/candidate_queue.rs`.

`createCandidate` validates input, computes normalized URL/content hash, checks `dedupe_keys`, inserts or reuses a target post, creates the candidate, then stores both dedupe keys in one transaction. It is the attended manual override and omits automatic policy enforcement. Source imports call the same transaction-safe insert helper with `{ enforcePolicy: true }`, so all four policy classes run before target, candidate, or dedupe writes. Future automated connectors must use this enforced option.

The three operator mutations are native commands in `src-tauri/src/candidate_queue.rs`, each on one pinned `BEGIN IMMEDIATE` connection and returning `{ id }`:

- `linkgo_candidate_create` (`createCandidate`) — native re-checks the campaign and computes every dedupe input itself: the WHATWG-normalized URL (`src-tauri/src/js_url.rs`), the content hash (FNV-1a over UTF-16 units) and the target URN, all identical to the values the renderer used to write. It then writes the target post, candidate and both dedupe keys. Unknown input fields (including a caller-supplied `normalizedUrl`) are rejected. A unique-constraint race reports the duplicate message.
- `linkgo_candidate_delete` (`deleteCandidate`) — settles linked draft requests first (native port in `src-tauri/src/draft_generation_links.rs`: cancel pending agent runs, dismiss requests, block the workflow draft step), then deletes dedupe keys and the candidate. A request that is not attached to an active draft step blocks the delete.
- `linkgo_candidate_promote_discovery_item` (`promoteDiscoveryItem`) — adds the trimmed keyword (keyword suggestions only) and marks the suggestion promoted.

Source imports reuse the same native insert with policy enforcement (see Source Imports). Real-SQLite tests: `src-tauri/src/candidate_queue_tests.rs`.

The renderer has no direct SQL access to candidate tables. The remaining reads and single-row writes live in `src-tauri/src/candidate_queue_store.rs`. Every input rejects unknown fields and non-positive ids:

- `linkgo_candidate_list` (`listCandidatePage`, `listCandidates`): returns `{ rows, totalCount }` — candidates joined with their target post, rejected last, then newest update first, capped at 500 rows. `totalCount` is the uncapped match count, read in the same transaction. `listCandidates` returns only the rows. When `totalCount` exceeds the rows, the Ideas tab shows "Showing the first 500 of N ideas", uses `totalCount` for Total, and labels scored, shortlisted, average and per-status counts as covering the shown rows.
- `linkgo_candidate_discovery_list` (`listDiscoveryItems`): non-dismissed suggestions, promoted last, then highest confidence and newest first. Capped at 200 rows.
- `linkgo_candidate_agent_run_context`: checks the campaign exists and is not archived, then returns up to 12 seed keywords and up to 50 unscored `new` candidate ids. The agent run starts only after this returns, so no provider call runs inside a database transaction.
- `linkgo_candidate_update` (`updateCandidate`/`setCandidateStatus`): sets only the fields provided. An explicit `relevanceScore: null` clears the score. Status, score (0–100), reason (≤ 500) and notes (≤ 1000, trimmed) are re-validated natively. A missing id is a silent no-op, as before.
- `linkgo_candidate_dismiss_discovery_item`: checks the campaign can change and that the suggestion belongs to it.
- `linkgo_candidate_discovery_insert` (`research_posts` tool): checks the campaign can change and that the agent run belongs to it. It then collapses whitespace, bounds each text field, drops empty or duplicate suggestions and reuses live matches, all in one transaction. Two runs saving the same suggestion at once still leave one row.

Tests: `src-tauri/src/candidate_queue_store_tests.rs`.

`runCandidateDiscovery` loads the native agent-run context first, then creates and starts a researcher agent run. The `research_posts` tool persists up to 25 validated suggestions and attaches agent/workflow provenance.

`scoreCandidates` creates and starts an attended scorer agent run. The `score_relevance` contract requires 1–50 unique candidate IDs and exactly one bounded score/rationale for every requested ID. Missing, duplicate, extra, or foreign score IDs fail before writes; no synthetic fallback score is fabricated.

`applyRelevanceScoresFromTool` calls a restricted native scoring command. That command pins `BEGIN IMMEDIATE` to one SQLx connection, rechecks campaign ownership plus `new`/unscored state for every candidate, and requires every update to affect one row. Scores and optional below-threshold rejection commit as one set or roll back completely. Planner-linked runs additionally require the tool IDs and policy to match the persisted approved context; see `docs/features/relevance-scoring.md`.

## UI

`CandidateQueueView` renders:

- Header and explanation that intake, discovery, and scoring are operator-triggered while external actions remain gated.
- Campaign selector.
- Candidate intake policy summary (on screen: `Idea filters`) and accessible editor, including archived read-only state and manual-override disclosure.
- `Find topics`, `Score ideas`, `Import posts`, and `Add idea` actions. `#/queue?find=1` opens Find topics once a non-archived campaign is selected (the setup checklist's **Find your first idea**); closing it removes `find` from the link. The param type lives in `schemas.ts` because `types/index.ts` already imports it.
- Find topics defaults its AI service to the first connected AI service (via `useAgentAccounts`, same as Generate draft) and that service's default model. Practice mode stays selectable and is the default only when no AI service is connected. The default updates once connected accounts finish loading unless the operator already picked a service or typed a model; closing the dialog resets to the default.
- Loading and retry states.
- No-campaign state with **Create your first campaign**, and empty-queue state.
- Summary cards for total candidates, suggestions, scored candidates, shortlisted candidates, and average score.
- Discovery suggestion cards with promote/dismiss actions.
- Recent source import batches with accepted, duplicate, and rejected item reasons.
- Candidate cards grouped by status.

`ImportSourcePostsDialog` accepts bounded local JSON, preserves text after validation errors, and reports batch totals without closing immediately. Import mutations are disabled for archived campaigns while history stays visible. See `docs/features/source-imports.md` for the format and lifecycle.

`AddCandidateDialog` captures URL, content, author metadata, posted-at text, source keyword, score, reason, and notes. It remains an explicitly attended override for historical or exceptional material.

`CandidateCard` shows candidate source details, the post-stage tracker (see [post flow](post-flow.md)) and one primary next step chosen from the stage:

- `Write post` (stage Idea, idea not rejected, campaign not archived) — opens Write with AI with this idea locked in (`#/drafts?campaignId=C&candidateId=X&write=1`).
- `Open draft` (stage Draft) — Drafts filtered to this idea.
- `Open approval` (waiting, approved without a time, posted, results, or a failed post) — Approvals with the approval highlighted.
- `See on calendar` (scheduled) — Calendar with the post highlighted.

The status actions are secondary (outline):

- `Shortlist`
- `Reject`
- `Mark drafted`
- `Reset to new`
- `Open drafts` — opens Drafts filtered to this idea (`#/drafts?campaignId=C&candidateId=X`; see [navigation](navigation.md)); hidden when `Open draft` is already the primary step
- `Delete`

`useCandidateQueue` loads the stage index with `usePostStageIndex` and reloads it whenever the idea list reloads. If the stage read fails the tracker and primary step hide; the rest of the screen keeps working.

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
