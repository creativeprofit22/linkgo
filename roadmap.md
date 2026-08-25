# Linkgo Roadmap

Linkgo is a programmatic LinkedIn growth agent: code handles approved source intake, queues, dedupe, scoring, limits, approvals, scheduling, retries, and metrics; agents handle research, drafting, critique, and learning. Linkgo does not scrape LinkedIn or perform autonomous external actions.

## Audit status

**Audited:** August 25, 2026

**Repository baseline:** `main` at `009187f` (`chore(db): enforce renderer transaction allowlist`) plus the current uncommitted Section 8A implementation. The schema is ordered through Migration 33. Audit-only scratch logs were excluded.

**Status summary:** 5 sections implemented, 15 partial (including one externally blocked), and 0 not started.

- **Implemented:** Every core acceptance statement in the numbered item exists.
- **Partial:** A usable foundation exists, but one or more explicit roadmap outcomes are missing.
- **Not started:** The defining outcome does not exist, even if adjacent foundations do.
- **Blocked:** Implementation requires product, legal, platform-access, or architecture approval.

### Audit evidence

- **Quality gate — failing:** ESLint, TypeScript/Vite build, renderer-transaction guard, and `cargo fmt --check` pass. The current tree fails `cargo test` because the Migration 32 order assertion still expects `[31, 32]` after Migration 33; Clippy reports three `useless_vec` errors in new draft-quality tests; Playwright has one real prompt-contract failure, while the remaining browser tests could not run because the expected Chromium binary is missing locally. Repository LF content is Prettier-clean; local `core.autocrlf=true` causes false formatting failures on checked-out CRLF files.
- **Transaction integrity — unresolved P0:** The static guard prevents growth but allowlists 105 control statements, including 46 renderer-managed `BEGIN` blocks across 10 files: agent runtime (6), approvals (2), candidate policy (1), candidate queue (3), comments (6), drafts (13), metrics (3), safety (2), source imports (3), and workflows (7). Separate plugin-SQL calls still lack guaranteed connection affinity; the existing mock still cannot prove production rollback or concurrency behavior.
- **Security boundary — high priority:** Both `main` and `settings` webviews retain SQL load/select/execute plus webview-creation permissions, and CSP still permits arbitrary `http:` and `https:` connections. An unused native command can return AI provider secrets to renderer code. Custom provider Base URLs are accepted without URL, HTTPS, or private-network validation, allowing native requests to operator-supplied destinations.
- **Supply chain:** `bun audit --production` reports 6 advisories (4 high, 2 moderate) in the Vite/PostCSS/Nanoid build chain. `cargo audit` reports 4 vulnerabilities (`quick-xml` twice, `rkyv`, and `rsa`) plus 20 warnings. Reachability and safe upgrades still require dependency-tree review; CI does not run either audit, pin actions to commit SHAs, or scan repository history for secrets.
- **Positive controls:** No frontend HTML/eval sink was found. Provider secrets normally stay native, model-selected tools are replaced by native schemas and allowlisted, draft text is explicitly treated as untrusted content, credentials use the OS keyring by default, and LinkedIn publishing/commenting remain human approval-gated.
- **Roadmap/documentation drift:** Section 8A now exists but is not releasable until its failing Rust, Clippy, and prompt-contract tests pass. `docs/ARCHITECTURE.md` still denies renderer transaction control, while README omits the quality loop.
- **External dependency:** Section 3 still requires one production source connector that passes LinkedIn/API terms, permissions, access, and permitted-use review. It remains blocked on that decision.

| Roadmap                               | Status                | Evidence and remaining work                                                                                                                                                                                              |
| ------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Agent runtime                       | **Implemented**       | The provider/model loop and all six Zod tool contracts exist.                                                                                                                                                            |
| 2 Streaming + model layer             | **Partial**           | Provider-neutral execution and event streaming exist; roadmap-specific lifecycle progress and full side-effect integration remain incomplete.                                                                            |
| 3 Campaign + autopilot queue          | **Partial / Blocked** | Campaigns, guarded connector-neutral local intake, recurring backlog planning, and the bounded idempotent Roadmap 3D local planner exist. One compliant production connector is the sole remaining access/terms blocker. |
| 4 Keyword + trend discovery           | **Partial**           | Structured operator-triggered suggestions exist; expansion from real posts and competitor/source imports does not.                                                                                                       |
| 5 Relevance filtering                 | **Partial**           | Rules-first intake plus attended planner-linked connected-provider scoring, exact-set atomic writes, rationale, and optional low-score rejection exist; unattended/background scoring and a production connector remain. |
| 6 Draft generation                    | **Implemented**       | Exactly 3–5 save-gated provider variants use fixed event, launch, idea, or community prompt routes and optional planner workflow provenance.                                                                             |
| 7 Humanizer + audit                   | **Partial**           | Revision-scoped AI audit runtime and attended planner-linked saved-draft workflow execution exist; enforced believable first-person specifics remain.                                                                    |
| 8 Quality scoring loop                | **Partial (8A)**      | Migration 33 persists five-category scorecards and an attended, bounded rewrite/re-audit/re-score loop with a fixed 70 threshold and two-rewrite cap. Planner/background ownership remains.                              |
| 9 Content calendar                    | **Implemented**       | Purpose, angle, format, visual direction, CTA, and the approval bridge exist.                                                                                                                                            |
| 10 Approval gate                      | **Partial**           | Durable human approvals and runtime continuation exist; shareable review links and wait URLs do not.                                                                                                                     |
| 11 Durable workflow engine            | **Partial**           | Typed resumable steps, events, attempts, agent-run artifacts, and planner candidate/draft/audit flow exist; approval/schedule/metric artifacts and owned background jobs remain.                                         |
| 12 Publishing + scheduling            | **Partial**           | Native LinkedIn scheduling, retries, idempotency, and platform IDs exist; a destination abstraction and additional providers do not.                                                                                     |
| 13 Comment/reply agent                | **Partial**           | Approval-gated manual variants and API posting exist; provider-generated comments and background work do not.                                                                                                            |
| 14 LinkedIn API formatting            | **Partial**           | LittleText escaping and text limits exist; unified media/link preflight is incomplete.                                                                                                                                   |
| 15 Metrics + learning loop            | **Partial**           | Manual metrics, reaction/comment refresh, memory, and events exist; automatic winner/loser learning injection is incomplete.                                                                                             |
| 16 Safety, rate limits, observability | **Partial**           | Kill switch, daily caps, retry backoff, local audit history, and the error queue exist; cooldowns, per-account policy, and external telemetry do not.                                                                    |
| 17 Multi-agent workers                | **Partial**           | Role-specific runs exist; parallel research and drafting lanes do not.                                                                                                                                                   |
| 18 Skills + playbooks                 | **Implemented**       | Modular built-ins, overrides, compatibility filtering, and runtime prompt composition exist.                                                                                                                             |
| 19 Persistent task backlog            | **Implemented**       | One campaign-scoped cross-feature backlog now adds recurring due work, owner labels, lifecycle transitions, atomic successors, and bounded history to the durable feature stores.                                        |
| 20 Error queue                        | **Partial**           | A fixable queue and transitions exist; rejected-draft and low-performance automatic items do not.                                                                                                                        |

## Priority queue

1. **P0 — Restore the release gate:** Fix the Migration 32 order assertion, three draft-quality Clippy errors, and auditor prompt-contract regression. Install the pinned Playwright Chromium and rerun all 273 tests plus the complete `bun run check`; do not mark Section 8A complete before this passes.
2. **P0 — Finish renderer transaction remediation:** Treat the allowlist as a freeze, not completion. Migrate all 46 atomic mutations to capability-specific native commands with pinned SQLx connections, add real-SQLite rollback/concurrency tests, and reduce the allowlist to zero before autonomous workflow expansion.
3. **P1 — Close renderer secret and network exposure:** Remove the unused provider-secret command, validate custom Base URLs at native ingress (HTTPS by default; explicit local-development exception), split main/settings capabilities, remove renderer SQL access after migration, and narrow CSP `connect-src` to required origins.
4. **P1 — Remediate and gate dependencies:** Trace the Bun/Rust advisory paths, upgrade or document unreachable exceptions, add dependency and repository-history secret scans to CI, and pin third-party GitHub Actions by commit SHA.
5. **P2 — Complete Section 8 ownership:** After the gate and security work, add planner/background ownership and policy-driven quality execution while preserving human approval gates.
6. **P2 — Synchronize documentation:** Correct architecture transaction claims, roadmap mapping, README feature status, and CI verification notes after implementation matches them.

## Delivered campaign-to-audit sequence

Roadmap 3 remains **Partial / Blocked** until one compliant production source connector exists. Its local path is complete through bounded planning, attended scoring, save-gated planner-linked draft generation, and attended revision-scoped audit execution.

1. **3A — Local source import foundation (complete):** Bounded JSON import, per-row validation, shared candidate dedupe, durable batch outcomes, and reviewable rejection reasons.
2. **3B — Candidate policy guardrails (complete):** Age, source, banned-topic, and already-contacted rules run before enforced intake can write candidate artifacts.
3. **3C — Persistent campaign backlog (complete):** Campaign due work, Operator/Linkgo responsibility, daily/weekly recurrence, immutable history, and atomic future successors.
4. **3D — Autopilot planner (complete):** Connector-neutral local source contracts and a bounded, idempotent native planner create linked scoring backlog/workflow work and exact candidate artifacts for active `auto_pilot` campaigns. Research is complete and score is pending.
5. **5A — Planner-linked relevance scoring (complete slice):** An operator can confirm a connected provider, exact scope, threshold, and optional low-score rejection in Workflows. Exact score sets commit atomically and synchronize workflow/backlog state. The native planner remains model-free.
6. **6A — Planner-linked draft generation (complete):** Route `event`, `launch`, `idea`, or `community`; generate exactly 3–5 provider-authored variants; keep linked work on `draft` until explicit save; then attach the draft artifact and start `audit`.
7. **7A — Planner-linked saved-draft AI audit (complete slice):** A human starts serial auditing of every variant's current revision in variant order with inherited generation provider/model provenance. Completed current revisions are skipped; failure and 15-minute stale recovery require explicit Resume. Final findings, audit completion, and the transition to human approval waiting settle atomically.
8. **Production connector (blocked):** Complete Roadmap 3 with one remote source connector only after its API access, terms, permissions, and permitted use are verified.

The safe default remains local structured source import. Arbitrary LinkedIn feed search, scraping, browser automation, autonomous external actions, and unattended model execution are excluded.

## 1. Agent runtime — Implemented

- Use `@kenkaiiii/gg-agent` style loop: model calls typed tools, receives results, loops until done.
- Pattern: `gg-framework/packages/gg-agent/src/agent-loop.ts`, `gg-framework/packages/gg-agent/src/types.ts`.
- Build tools as Zod schemas: `research_posts`, `score_relevance`, `draft_post`, `audit_post`, `schedule_post`, `collect_metrics`.

**Evidence:** The provider/model loop and six typed Zod tool contracts are implemented.

## 2. Streaming + model layer — Partial

- Use a provider-neutral wrapper so models can swap without changing workflow code.
- Pattern: `gg-framework/packages/gg-ai/src/types.ts`, `gg-framework/packages/gg-ai/README.md`.
- Stream progress events into UI: researching, drafting, auditing, waiting approval, scheduled.

**Evidence:** Provider-neutral execution and event streaming are implemented.

**Remaining:** Complete the roadmap-specific lifecycle vocabulary and connect every side-effecting path to the streamed execution layer.

## 3. Campaign + autopilot queue — Partial / Blocked

- Store campaigns with `autoPilot`, keywords, platform prefs, voice, tone, product, audience.
- Pattern: `cameronking4/ReplyGuy-clone/app/api/cron/campaign/post/route.ts`.
- Cron finds active campaigns, fetches recent target posts, batches work, stores candidates.

**Evidence:** Campaign storage, attended candidate intake, Roadmap 3A bounded local source ingestion, Roadmap 3B enforced intake policy, Roadmap 3C recurring backlog, and Roadmap 3D local Autopilot Planner are implemented. The closed connector registry exposes only non-fetching `local_json`; active opted-in campaigns can convert terminal approved batches into exactly one linked Linkgo scoring item and one queued score-first workflow through a bounded, kill-switch-gated, idempotent native transaction.

**Remaining:** Complete Roadmap 3 with one compliant production connector after API-access, terms, permissions, and permitted-use approval. No remote connector is currently enabled.

## 4. Keyword + trend discovery — Partial

- Generate seed keywords from campaign context, then expand from real posts and competitors.
- Pattern: `cameronking4/ReplyGuy-clone/app/actions/ai.ts` `generateCampaignKeywords`.
- Output must be structured JSON via Zod, not loose text.

**Evidence:** Operator-triggered keyword, trend, and source-prompt suggestions use structured output.

**Remaining:** Expand from persisted real posts and verified competitor/source connectors.

## 5. Relevance filtering — Partial

- Batch candidate posts, dedupe, score relevance, reject weak matches before drafting.
- Pattern: `cameronking4/ReplyGuy-clone/app/actions/ai.ts` `filterRelevantPostsInBatches`.
- Programmatic rules first: source, age, duplicate URL/text, banned topics, already-contacted.

**Evidence:** Programmatic source, age, URL/content dedupe, Unicode whole-word banned-topic, and successful prior-contact identity rules run before enforced intake writes candidate artifacts. Roadmap 5A adds attended planner-linked connected-provider scoring with durable exact scope, bounded campaign/candidate context, exact-set validation, one-transaction score writes, optional low-score rejection, retryable attempts, and synchronized workflow/backlog state.

**Remaining:** Add unattended/background scoring ownership only after its lifecycle is designed, and complete one compliant production source connector. Roadmap 5 remains partial.

## 6. Draft generation — Roadmap 6A complete

- Create 3-5 LinkedIn draft variants per approved idea.
- Pattern: `sergebulaev/linkedin-skills/skills/linkedin-post-writer/SKILL.md`.
- Use 2026 hooks: contrarian, curiosity gap, year-pivot, paid-vs-free, self-proving.
- Route by type: events, launches, ideas, community.
- Pattern: `getnao/sylph/.claude/skills/linkedin/SKILL.md`.

**Evidence:** Provider-assisted generation enforces exactly 3–5 variants and one fixed content intent (`event`, `launch`, `idea`, or `community`). Optional planner workflow provenance is claimed before the provider call. The durable request and agent evidence persist before execution; exact `draft_post` identity, intent, count, and normalized variants are validated before generated text is held for review. Explicit save atomically creates the draft, variants, deterministic audits, one draft artifact, workflow events, and the transition to `audit`. Failure or dismissal blocks linked work and releases the active-request claim for retry.

**Remaining:** No Roadmap 6A implementation gap. Background generation, automatic rewrite loops, approval creation, scheduling, publishing, scraping, and production source ingestion remain outside this slice.

## 7. Humanizer + audit pass — Partial

- Run every draft through deterministic + AI checks before approval.
- Pattern: `sergebulaev/linkedin-skills/skills/linkedin-humanizer/sub-skills/post-audit.md`.
- Block: AI tells, weak hook, external link in body, >3000 chars, too many hashtags, no concrete detail.
- Force believable first-person specifics.
- Pattern: `Core-Mate/OpenGUI/server/apps/backend/src/modules/creator-agent/templates/platform-prompts.ts`.

**Evidence:** Deterministic blockers and warnings are implemented. The callable, revision-scoped AI auditor reserves durable work before provider execution, validates exact `audit_post` identity and canonical text, atomically stores all six findings, rejects stale results, and reconciles interrupted audit/agent lifecycle state at startup. The planner-linked saved-draft slice adds Migration 32 and attended workflow ownership: every variant's current revision runs serially in variant order using the saved generation provider/model or that provider's default model. Completed current revisions are skipped. Failures stop durably until explicit **Resume variant audits**, while linked claims stale after 15 minutes are transactionally failed for the same Resume path. Claim, failure, and settlement are transactional; the final six findings, audit/execution completion, `audit` completion, and `approve` `waiting_approval` transition commit together. Warning and `block` findings remain human-review evidence rather than automatically blocking approval. Manual audits are unchanged.

**Remaining:** Roadmap 7 remains **Partial** because believable first-person specifics are reported as findings rather than enforced before approval. This slice does not automate approval, scheduling, publishing, rewriting, or other external actions.

## 8. Quality scoring loop — Partial (8A)

- Score hook, authenticity, platform fit, specificity, narrative structure.
- Pattern: `Deodat-Lawson/LaunchStack/packages/features/src/marketing-pipeline/generator.ts`.
- If below threshold, rewrite automatically and re-score.

**Evidence:** Migration 33 persists revision-scoped runs, immutable attempts, and all five canonical category scores. An explicit operator action scores against 70, allows at most two atomic rewrites, re-runs the current AI audit, re-scores serially, supports stale recovery/resume, and gates new approvals without approving or publishing.

**Remaining:** Add planner/background ownership and policy-driven automatic execution while preserving human approval gates.

## 9. Content calendar — Implemented

- Turn approved ideas into slots with purpose, angle, format, visual direction, and CTA.
- Pattern: `stevenflanagan1/social-ai-team/skills/content-calendar/SKILL.md`.
- No filler slots; every post must serve reach, trust, proof, conversion, or community.

**Evidence:** Calendar slots require purpose, angle, format, visual direction, and CTA, and bridge into approval.

## 10. Approval gate — Partial

- Drafts can be automatic; publishing requires human approval.
- Pattern: `CopilotKit/CopilotKit/packages/runtime/src/agent/converters/aisdk.ts` tool approval interrupts.
- Add review links / wait URLs for approvals.
- Pattern: `n8n-io/n8n/packages/cli/src/webhooks/waiting-webhooks.ts`.
- Store states: `drafted -> needs_review -> approved -> scheduled -> published -> measured`.

**Evidence:** Human approvals are durable and can continue paused runtime work.

**Remaining:** Add shareable review links and wait URLs.

## 11. Durable workflow engine — Partial

- Represent the pipeline as typed steps with resumable state: research -> score -> draft -> audit -> approve -> schedule -> measure.
- Patterns: `kaiban-ai/KaibanJS/packages/workflow/src/workflow.ts`, `jwynia/agent-skills/skills/tech/ai/mastra-hono/assets/workflow-template.ts`.
- Keep long jobs resumable; expose step progress to UI.

**Evidence:** Typed resumable steps, workflow events and attempts, agent-run artifacts, planner-linked `candidate_post` and saved `draft` artifact flow, and attended planner-owned AI audit execution exist. Score and audit claims reject duplicate active attempts and retain durable retry history.

**Remaining:** Complete approval/schedule/metric artifact flow and owned background jobs.

## 12. Publishing + scheduling — Partial

- Start with scheduler abstraction; hide LinkedIn/Publora/Blotato differences behind one tool.
- Patterns:
  - `sergebulaev/linkedin-skills/lib/publora_client.py`
  - `activepieces/activepieces/packages/pieces/community/linkedin/src/lib/actions/create-share-update.ts`
  - Blotato `POST https://backend.blotato.com/v2/posts` examples in n8n workflow repos.
- Include retries, idempotency keys, duplicate prevention, and platform IDs.

**Evidence:** Native LinkedIn scheduling, retries, idempotency, duplicate prevention, and platform IDs exist.

**Remaining:** Introduce the destination abstraction and verified additional providers.

## 13. Comment/reply agent — Partial

- Generate comments only for approved target posts; keep tone/comment limits separate from post writing.
- Patterns: `cameronking4/ReplyGuy-clone/app/api/cron/campaign/comment/route.ts`, `cameronking4/ReplyGuy-clone/lib/linkedin-api/index.ts`.
- Add stricter anti-spam throttles than post publishing.

**Evidence:** Approval-gated manual comment variants and LinkedIn API posting exist.

**Remaining:** Add provider-generated comments and owned background work while retaining stricter anti-spam limits.

## 14. LinkedIn API formatting — Partial

- Escape LinkedIn LittleText characters before publishing.
- Pattern: `activepieces/activepieces/packages/pieces/community/linkedin/src/lib/common/index.ts` `santizeText`.
- Enforce char limits and media/link rules programmatically.

**Evidence:** LittleText escaping and text limits are enforced.

**Remaining:** Complete unified media and link preflight.

## 15. Metrics + learning loop — Partial

- Collect impressions, reactions, comments, profile visits, CTR when available.
- Feed winners/losers back into campaign memory.
- Pattern: `gg-framework/packages/gg-agent/src/types.ts` `transformContext` for compact memory injection.

**Evidence:** Manual metrics, API reaction/comment refresh, campaign memory, and metric events exist.

**Remaining:** Automatically classify winners/losers and inject that learning into future execution.

## 16. Safety, rate limits, observability — Partial

- Add per-account daily caps, cooldowns, retry backoff, audit logs, and kill switches.
- Pattern: `gg-framework/packages/gg-agent/src/agent-loop.ts` retry/error handling; `gg-framework/packages/ggcoder/src/core/logger.ts` debug logging.
- Default to conservative limits; scale only after metrics prove quality.

**Evidence:** Conservative daily caps, kill switch behavior, retry backoff, local audit history, and a fixable error queue exist.

**Remaining:** Add cooldowns, complete per-account policy, and integrate external telemetry.

## 17. Multi-agent workers — Partial

- Split work: researcher, drafter, auditor, scheduler, analyst.
- Pattern: `gg-framework/packages/ggcoder/src/tools/subagent.ts`, `gg-framework/packages/gg-boss/src/orchestrator.ts`.
- Run research and drafting in parallel; keep publishing serial and approval-gated.

**Evidence:** Role-specific agent runs exist and publishing remains serial and approval-gated.

**Remaining:** Implement parallel research and drafting lanes.

## 18. Skills + playbooks — Implemented

- Store reusable LinkedIn playbooks as skills: writer, humanizer, calendar, commenter, analyst.
- Pattern: `gg-framework/packages/ggcoder/src/core/skills.ts`, `gg-framework/packages/ggcoder/src/tools/skill.ts`.
- Keep prompts modular instead of one giant system prompt.

**Evidence:** Modular built-ins, user overrides, compatibility filtering, and runtime prompt composition exist.

## 19. Persistent task backlog — Implemented

- Keep weekly jobs, pending approvals, metric reviews, and failed publishes resumable.
- Pattern: `gg-framework/packages/gg-boss/src/boss-store.ts`, `gg-framework/packages/gg-boss/src/boss-tasks-overlay.tsx`.
- Use direct dispatch for one-offs; backlog for recurring campaigns.

**Evidence:** The campaign backlog persists one-off/daily/weekly due work across research, scoring, drafting, approval, scheduling, metrics, retries, and other operator work. It exposes Operator/Linkgo responsibility, legal lifecycle transitions, immutable bounded history, and transactional recurring successors while existing workflow, scheduler, approval, refresh, and error records remain resumable in their domain stores.

## 20. Error queue — Partial

- Failed publishes, rejected drafts, and low-performing posts become fixable queue items.
- Pattern: `gg-framework/packages/gg-pixel` and `gg-framework/CLAUDE.md` Pixel section.
- Statuses: `open -> in_progress -> awaiting_review -> resolved/failed`.

**Evidence:** A fixable queue and the required status transitions exist.

**Remaining:** Automatically create queue items for rejected drafts and low-performing posts.
