# Candidate Intake Policy

## Status

Roadmap 3B is implemented. Every bulk or unattended candidate insert can opt into one campaign-scoped deterministic policy at the shared candidate transaction boundary. Local JSON source imports use this enforced path now. Roadmap 3C is next.

## Conservative default

A campaign without a stored policy row resolves to:

- Maximum post age: 30 days.
- HTTPS LinkedIn source required.
- Absolute ISO-8601 timestamp with a timezone required.
- Materially future timestamps rejected.
- Successful prior contact rejected.
- No banned topics until an operator adds them.

`max_post_age_days` accepts 1–365. A campaign can store up to 25 banned topics, each 1–80 normalized characters.

## Evaluation order

The engine evaluates every policy class and returns all bounded findings in this order:

1. `source`
2. `age`
3. `banned_topic`
4. `already_contacted`
5. Existing URL/content dedupe after policy acceptance

The first finding becomes the durable `policy_rule_key`. A policy rejection is a normal row result: the source-import item becomes `rejected`, valid neighboring rows continue, and no target post, candidate post, or dedupe key is written.

## Rule semantics

### Source

The URL must parse, use HTTPS, and have `linkedin.com` or a subdomain of `linkedin.com` as its hostname. Similar-looking domains are rejected. The check performs no network request.

### Age

The row must provide an absolute ISO-8601 timestamp ending in `Z` or a numeric timezone offset. The timestamp must be no older than the configured whole-day limit. A five-minute clock-skew allowance prevents trivial future drift; timestamps farther ahead are rejected.

### Banned topics

Terms are normalized with Unicode NFKC, lowercasing, trimming, and whitespace collapse. Duplicates use the same normalization. Matching is case-insensitive against post content and source keyword, allows flexible phrase whitespace, and requires Unicode letter/number boundaries. For example, `ai` matches `AI,` but not `said`.

### Already contacted

A successful Linkgo comment attempt blocks intake when its target has the same normalized post URL, platform resource URN, or normalized author-profile URL. Failed attempts do not block. Author display names never block because same-name identity is unsafe. Draft, rejected, or unposted comment threads and Linkgo-authored published posts are not contact evidence.

## Manual and enforced paths

The evaluator is native (`evaluate_intake_policy` in `src-tauri/src/candidate_policy.rs`) and is the required path for local source imports and every connector that feeds the Roadmap 3D planner boundary. Policy evaluation happens before target, candidate, or dedupe writes, inside the row's pinned transaction. It ports the former renderer evaluator exactly: WHATWG URL parsing (`url` crate, `src-tauri/src/js_url.rs`), NFKC + lowercase topic matching with JS whitespace and Unicode letter/number boundaries (`unicode-normalization`), and V8-compatible ISO-8601 parsing including calendar and offset checks. Parity tests pin each helper to outputs recorded from the old JS on Node 22.

`createCandidate(input)` intentionally omits enforcement. `Add idea` is an attended override for an operator deliberately capturing historical or exceptional material. It is not an autopilot-safe path.

## Data API

`src/features/candidate-policy/data.ts` exports:

- `getCandidateIntakePolicy(campaignId)`
- `updateCandidateIntakePolicy(input)`

Updates reject missing or archived campaigns and atomically upsert the age limit and replace normalized topic rows. Policy evaluation is native: `evaluate_intake_policy` in `src-tauri/src/candidate_policy.rs` takes an injected `now_ms` so tests stay deterministic; production passes the current instant.

`updateCandidateIntakePolicy` calls the native `linkgo_candidate_policy_update` command (`src-tauri/src/candidate_policy.rs`). Native NFKC-normalises and single-spaces topics itself (the renderer schema does the same for form feedback) and validates the canonical shape (1–365 days, ≤ 25 topics of 1–80 chars, no case-insensitive duplicates), checks the campaign exists and is not archived, and writes the policy, topic replacement and saved-policy read on one pinned `BEGIN IMMEDIATE` connection. Real-SQLite tests: `src-tauri/src/candidate_policy_tests.rs`.

`getCandidateIntakePolicy` calls the native `linkgo_candidate_policy_get` command, which takes a positive `campaignId` and rejects unknown fields. It returns the saved policy, or the 30-day default with no topics and null timestamps when none is saved. The policy row and its banned topics are read in one transaction, so a read that runs during an update sees either the old policy or the new one, never a mix. The renderer has no direct SQL access to the policy tables.

## UI

The Ideas tab's policy card (on screen: `Idea filters`) appears directly after campaign selection. It summarizes the age limit, fixed source/timestamp/contact rules, banned-topic count, and attended manual override. `Edit filters` opens a keyboard-operable Radix dialog (`Edit idea filters`) with inline validation and preserved values after failures. Archived campaigns remain visible and read-only.

## Safety exclusions

Roadmap 3B adds no scraping, remote lookup, connector, model call, recurring work, autopilot execution, drafting, commenting, scheduling, or publishing. Future automated intake must explicitly use the shared enforced insert option.

## Verification

```bash
bunx playwright test tests/candidate-policy.spec.ts tests/source-imports.spec.ts tests/candidate-queue.spec.ts
bun run test:rust
bun run format:check
bun run lint
bun run build
bun run check
```

Playwright covers defaults, persistence, validation, archived mutation rejection, stale campaign responses, keyboard focus return, narrow reflow, all four policy classes, rollback safety, labels, and the attended manual override. Performance remains unverified because no real timing profile was run; inputs and visible history are bounded.
