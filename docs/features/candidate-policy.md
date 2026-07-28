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

`createCandidateInTransaction(db, input, { enforcePolicy: true })` is the required path for local source imports and future Roadmap 3D planners/connectors. Policy evaluation happens before target, candidate, or dedupe writes.

`createCandidate(input)` intentionally omits enforcement. `Add candidate` is an attended override for an operator deliberately capturing historical or exceptional material. It is not an autopilot-safe path.

## Data API

`src/features/candidate-policy/data.ts` exports:

- `getCandidateIntakePolicy(campaignId)`
- `updateCandidateIntakePolicy(input)`
- `evaluateCandidateIntakePolicy(db, subject, now?)`

Updates reject missing or archived campaigns and atomically upsert the age limit and replace normalized topic rows. The optional evaluator clock exists for deterministic testing; production uses the current instant.

## UI

The Candidate Queue policy card appears directly after campaign selection. It summarizes the age limit, fixed source/timestamp/contact rules, banned-topic count, and attended manual override. `Edit policy` opens a keyboard-operable Radix dialog with inline validation and preserved values after failures. Archived campaigns remain visible and read-only.

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
