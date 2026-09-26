# Linkgo Roadmap

Linkgo is a programmatic LinkedIn growth agent: code handles approved source intake, queues, dedupe, scoring, limits, approvals, scheduling, retries, and metrics; agents handle research, drafting, critique, and learning. Linkgo does not scrape LinkedIn or perform autonomous external actions.

## Audit status

**Reviewed:** September 10, 2026 (refresh of the September 5 review)

**Repository baseline:** `6443368` (`test: synchronize draft failure and approval setup`). This review began with existing edits to `roadmap.md` and untracked `docs/verification/2026-09-05-baseline.md`; their findings and historical evidence are retained, with superseded claims corrected below. The schema is ordered through Migration 33. Only this roadmap is changed; application code and the existing verification note are untouched.

**Scope:** Source and test review across frontend features, agent/workflow orchestration, native commands, migrations, authentication, publishing, scheduler, capabilities, and CI; compared all 20 sections against implementation and feature documentation. Evidence labels distinguish commands observed in this session (**RUNTIME**), source inspection (**CODE**), inferred failure consequences (**DEDUCED**), and boundaries not exercised (**UNVERIFIED**). Historical harness classifications remain in the September 5 verification note; current process results do not claim a Roadmap phase transition or classifier acceptance.

**Status summary:** 5 sections implemented, 15 partial (including one externally blocked), and 0 not started.

- **Implemented:** Every core acceptance statement in the numbered item exists.
- **Partial:** A usable foundation exists, but one or more explicit roadmap outcomes are missing.
- **Not started:** The defining outcome does not exist, even if adjacent foundations do.
- **Blocked:** Implementation requires product, legal, platform-access, or architecture approval.

### Audit evidence

- **Application verification — RUNTIME:** Separate commands completed successfully: `bun run lint`, `bun run build` (TypeScript/Vite), `bun run check:renderer-transactions` (six guard tests; 105/105 allowlisted statements), `cargo test --manifest-path src-tauri/Cargo.toml` (176 library tests; zero failed), `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`. This establishes the current Windows source/test baseline, not packaged desktop behavior or release readiness.
- **Browser verification — RUNTIME, incomplete:** Fresh Playwright inventory lists 273 tests in 25 files. `bunx --no-install playwright test --shard=1/3 --reporter=line --output=test-results/audit-20260910-1` exited 1: 12 tests passed and 80 failed at browser launch because Chromium headless shell revision 1217 is absent. No application assertion was reached in those 80 cases; the other two shards were not run. No browser packages were installed. The preserved [September 5 verification note](docs/verification/2026-09-05-baseline.md) separately records 273 historical passing tests and accepted harness rows; the previous blanket statement that no accepted checks existed was stale. Neither that history nor the current partial run establishes a complete current browser/release pass. `bun run check` was not rerun against the known missing-browser prerequisite.
- **Formatting — RUNTIME, failed baseline:** `bunx --no-install prettier --check .` exited 1 in eight pre-existing files: `eslint.config.js`, six test files (`approvals`, `candidate-queue`, `helpers/tauri-mocks`, `integrations`, `scheduler`, `settings`), and the untracked September 5 verification note. No formatter repairs were applied. This is a verification prerequisite, not a newly introduced application defect.
- **Transaction integrity — unresolved P0:** The static guard prevents growth but allowlists 105 control statements, including 46 renderer-managed `BEGIN` blocks across 10 files: agent runtime (6), approvals (2), candidate policy (1), candidate queue (3), comments (6), drafts (13), metrics (3), safety (2), source imports (3), and workflows (7). Separate plugin-SQL calls still lack guaranteed connection affinity; the existing mock still cannot prove production rollback or concurrency behavior.
- **Security boundary — CODE, defense-in-depth:** `src-tauri/capabilities/default.json:5-43` grants both webviews SQL load/select/execute and webview creation; `src-tauri/tauri.conf.json:31` allows arbitrary HTTP/HTTPS connections. `src-tauri/src/auth/commands.rs:214` exposes AI provider secrets to a renderer caller. These increase the consequences of renderer compromise; they do not establish an anonymous remote exploit. Base URL validation at `auth/commands.rs:153-165` only checks presence for custom providers; `agent_runtime.rs:94-96,864-874` accepts the stored destination and sends bearer credentials. Require explicit destination consent, HTTPS by default, and a controlled local-development exception; assess redirects/private destinations at the same native boundary. **Update 2026-09-26 (hardening phase, uncommitted at time of writing):** renderer SQL was already removed (`c209131`); the provider-secret command is removed; destinations are validated at save and execution with explicit local consent; redirects are disabled (the default reqwest policy forwarded Anthropic's `x-api-key` cross-host) and responses bounded; an app ACL manifest plus split `main`/`settings` capabilities replace the shared capability; CSP `connect-src` is limited to IPC. See `docs/security/threat-model.md` and `docs/security/capability-matrix.md`.
- **Supply chain — RUNTIME/CODE:** Fresh `bun audit --production` exited 1 with 6 advisories (4 high, 2 moderate) through Vite/PostCSS/Nanoid. Fresh `cargo audit --file src-tauri/Cargo.lock` exited 1 with 4 vulnerabilities (`quick-xml` twice: RUSTSEC-2026-0194/0195; `rkyv`: RUSTSEC-2026-0235; `rsa`: RUSTSEC-2023-0071) and 10 warnings, superseding the previous unverified 20-warning count. `cargo tree -i` places `quick-xml 0.39.4` beneath `plist`/Tauri utilities; `rkyv` and `rsa` do not appear in the current target's enabled dependency tree. These are lockfile advisory matches, not demonstrated application exploits or proof that all affected APIs ship. Review enabled features, other supported targets, build-time inputs, and reachable APIs before selecting upgrades or dated exceptions. `.github/workflows/ci.yml` still lacks dependency/history-secret scans and uses tag-based rather than SHA-pinned actions.
- **Positive controls:** No frontend HTML/eval sink was found. Provider secrets normally stay native, model-selected tools are replaced by native schemas and allowlisted, draft text is explicitly treated as untrusted content, credentials use the OS keyring by default, and LinkedIn publishing/commenting remain human approval-gated.
- **Roadmap/documentation drift — [spec], CODE:** All 20 section statuses were rechecked; retain 5 Implemented and 15 Partial/Blocked. Section 8A exists but planner/background ownership remains missing. `src/agent/tools.ts:75-82` adds `score_draft_quality` to the six original contracts; Section 1 now records seven. `docs/ARCHITECTURE.md:26` describes the migrated capability pattern but should explicitly identify the remaining legacy renderer transactions. `docs/features/candidate-policy.md:5` still says 3C is next; `docs/ROADMAP_MAPPING.md:192` says audit UI/workflow execution is absent despite the delivered attended path; README omits the quality loop. Correct supporting documents alongside the affected slices, without promoting incomplete sections.
- **External dependency:** Section 3 still requires one production source connector that passes LinkedIn/API terms, permissions, access, and permitted-use review. It remains blocked on that decision.

### Correctness findings and acceptance checks

1. **[standards] P0 — Legacy renderer atomicity (CODE/DEDUCED):** `src/features/approvals/data.ts:434-435` still opens a renderer transaction; the guard reports 105 allowlisted control statements across the existing legacy paths. Independent pooled calls cannot establish pinned-connection ownership. Move each mutation to a native transaction; prove rollback after every intermediate write and isolation with concurrent real-SQLite callers. Installed `tauri-plugin-sql 2.4.0/src/wrapper.rs:146-166` confirms execution delegates each call to `pool.execute(query)` rather than a transaction-owned connection. The guard is a freeze, not proof of atomicity.
2. **[standards] P1 — Scheduler settlement can split state (CODE/DEDUCED):** `src-tauri/src/scheduler/mod.rs:431-630` separately writes publish attempts, approvals, jobs, audit events, and error items. A late database error can leave a successful external publish with incomplete local settlement. Commit each local outcome on one connection; keep network I/O outside the transaction and add an explicit ambiguous-outcome recovery path. Test interrupted finalization, retry/terminal rollback, and stale-lock overlap. Existing success-history checks (`auth/publish.rs:205-247`) help but cannot establish remote exactly-once delivery.
3. **[standards] P1 — Quality recovery orphans agent lifecycle (CODE/DEDUCED):** `src-tauri/src/draft_quality.rs:452-481` fails quality runs and scoring attempts without terminalizing their linked `agent_runs`. Resume can create replacement work while the old agent artifact remains queued/running. Settle agent state and lifecycle events atomically with failure/reconciliation; test repeated recovery and rejection of late results from the previous attempt.
4. **[standards] P1 — Quality eligibility lacks a native chokepoint (CODE):** `src/features/approvals/data.ts:464-475` validates audit/quality eligibility in the renderer, while `src-tauri/src/approval_scheduling.rs:122-129` trusts approval status. Move creation and eligibility into the native approval transaction, preserving approval-gated publishing; verify current revision, audit, and passing score and reject stale or failed eligibility through direct native calls. Treat this as an integrity/trust-boundary gap, not evidence that the normal UI skips human approval.
5. **[standards] P1 — Manual external success can be lost before recording (CODE/DEDUCED):** `src-tauri/src/auth/publish.rs:467-540` preflights, sends the post/comment, and returns without durably reserving or settling that external attempt. `src/features/approvals/components/publish-linkedin-dialog.tsx:76-116` records success in a later renderer call and explicitly handles recording failure. If the app exits or recording fails after remote success, local eligibility can permit a duplicate retry; a disabled dialog button is not cross-caller exclusion. Move reservation and settlement into shared native orchestration used by manual and scheduled publishing, retain human approval, and represent unknown remote outcomes for operator reconciliation rather than blind retry. Test competing command calls, interrupted delivery/recording, and manual-versus-worker overlap without live publishing. This is a source-confirmed gap with an inferred duplicate consequence, not a reproduced LinkedIn incident.
6. **[standards] P2 — Approval campaign loads can overwrite newer selection (CODE/DEDUCED):** `src/features/approvals/hooks/use-approvals.ts:73-87,121-125` unconditionally commits async results, and selection starts an unhandled load while the selection-dependent effect starts another. A slower previous campaign response can populate the current campaign view; a rejected selection load can escape error handling. Add request ownership/cancellation and one handled loading path. Test A→B selection with A resolving last, selection-load failure, and mutation refresh after selection changes; stale data must never become an actionable current-campaign view.

**Verification limits:** Browser tests use mocked Tauri/native behavior and do not establish production plugin-SQL connection affinity. Native SQLx tests passed, but packaged desktop startup/IPC, OS keyring behavior, live providers/LinkedIn calls, crash/power-loss recovery, other operating systems, full-history secret scanning, and advisory exploitability were not verified. No installed `gitleaks` executable or matching tool-catalog scanner was available; no scanner was installed. No paid or external publishing actions were performed. Stale-lock overlap remains a test requirement, not a reproduced duplicate publish. Rust compilation/tests and the requested strict Clippy invocation now pass as observed commands; historical classifier decisions are not rewritten.

**Security triage:** Three overstatements were excluded: broad webview privileges are conditional renderer-compromise impact, not anonymous remote access; opt-in plaintext credential fallback is not the keyring default; lockfile-only advisories are not proof of reachable Windows runtime vulnerabilities. Current source search found no renderer HTML/eval sink, but this was not a full-history credential scan or exhaustive injection proof. No security fixes were applied in this documentation-only review.

**Prior-review reference (retained, not re-fetched this session):** The [n8n pooled SQLite query runner](https://github.com/n8n-io/n8n/blob/b436bfa584c08dffd15bec80038de1da209af16b/packages/@n8n/typeorm/src/driver/sqlite-pooled/SqliteReadWriteQueryRunner.ts#L86-L145) leases one connection across BEGIN/COMMIT/ROLLBACK. Use Linkgo's existing native SQLx patterns to achieve the same ownership, not a new dependency.

| Roadmap                               | Status                | Evidence and remaining work                                                                                                                                                                                              |
| ------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Agent runtime                       | **Implemented**       | The provider/model loop, six original Zod tool contracts, and the quality-scoring contract exist.                                                                                                                        |
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

1. **P0 — Finish renderer transaction remediation, starting with approvals:** Move approval creation/eligibility and the remaining 46 legacy BEGIN blocks to capability-specific native commands with pinned SQLx connections. Add real-SQLite rollback/concurrency tests and shrink the 105-statement allowlist to zero before unattended workflow expansion. Enforce current-revision audit/quality eligibility at the native boundary, not only in UI queries.
2. **P1 — Unify manual and scheduled publishing recovery:** Add one native durable reservation/settlement path for posts and comments, then atomically settle local success/retry/terminal outcomes. Distinguish ambiguous remote success from safe retry; test interruption after external success, concurrent manual calls, manual-versus-worker overlap, and overlapping stale claims. Fence settlement so a previous owner cannot overwrite a reclaimed job. Preserve stable request identity without assuming LinkedIn guarantees exactly-once delivery. This precedes additional destinations and workers (Sections 11, 12, 13, 17).
3. **P1 — Repair quality-loop recovery:** Fail/cancel linked agent work and append lifecycle events in the same transaction as quality recovery. Resume must create one replacement attempt, reject old results, and remain idempotent across reloads (Sections 8, 11).
4. **P1 — Reduce renderer secret and network exposure:** Remove the unused provider-secret command, validate provider destinations at native ingress and execution, split main/settings capabilities, remove renderer SQL access after migration, and narrow CSP. Keep explicit operator-approved local provider support rather than silently breaking it. _(Implemented in the 2026-09-26 hardening phase; desktop ACL/CSP probe passed — see capability matrix.)_
5. **P1 — Remediate and gate dependencies:** Trace current Bun/Rust advisory paths, upgrade or record reviewed exceptions, add dependency and repository-history secret scans to CI, and pin third-party GitHub Actions by commit SHA. Verify release artifacts, not just development dependency counts.
6. **Release prerequisite — Complete verification:** Provision the pinned Playwright Chromium browser through an approved setup or CI, then rerun all 273 tests in bounded shards and reconcile every test identity. Resolve the eight baseline formatting failures without discarding existing documentation work; complete `bun run check`. Keep the now-passing Rust tests, formatting, and strict Clippy gates. Add real native integration coverage for the integrity/recovery findings; neither a missing browser nor a host timeout establishes an application regression.
7. **P2 — Complete Section 8 ownership, then workflow integration:** After integrity, recovery, and security work, add planner-owned quality execution, followed by approval/schedule/metric artifacts and controlled background orchestration (Sections 2, 5, 8, 11). Keep every external publish/comment human approval-gated; parallel workers come later.
8. **P2 — Fix approval selection ownership:** Guard against out-of-order campaign loads, consolidate duplicate selection fetches, and handle failures visibly before expanding the approval UI (Section 10). Add race/error regression tests.
9. **P2 — Synchronize supporting documentation:** Explicitly distinguish migrated capabilities from legacy transactions, correct the stale candidate-policy next step and audit mapping, and update README quality-loop coverage and verification notes with each slice. No new database tables are needed for this documentation update.

**Parallel external decision:** Review one compliant production connector for Section 3; continue using local structured imports until approval/access is available. Do not let this external blocker delay the local integrity fixes above.

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

**Evidence:** The provider/model loop and all six original typed Zod tool contracts are implemented, plus the seventh `score_draft_quality` contract introduced by 8A (`src/agent/tools.ts:75-82`).

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

**Remaining:** Repair linked agent lifecycle recovery, then add planner/background ownership and policy-driven automatic execution while preserving human approval gates. Approval eligibility must also be enforced at the native boundary.

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

**Remaining:** First move approval creation/current-revision eligibility into one native transaction and fix stale campaign-load ownership. Then add shareable review links and wait URLs.

## 11. Durable workflow engine — Partial

- Represent the pipeline as typed steps with resumable state: research -> score -> draft -> audit -> approve -> schedule -> measure.
- Patterns: `kaiban-ai/KaibanJS/packages/workflow/src/workflow.ts`, `jwynia/agent-skills/skills/tech/ai/mastra-hono/assets/workflow-template.ts`.
- Keep long jobs resumable; expose step progress to UI.

**Evidence:** Typed resumable steps, workflow events and attempts, agent-run artifacts, planner-linked `candidate_post` and saved `draft` artifact flow, and attended planner-owned AI audit execution exist. Score and audit claims reject duplicate active attempts and retain durable retry history.

**Remaining:** Repair linked quality-agent recovery and publishing settlement before completing approval/schedule/metric artifact flow and owned background jobs.

## 12. Publishing + scheduling — Partial

- Start with scheduler abstraction; hide LinkedIn/Publora/Blotato differences behind one tool.
- Patterns:
  - `sergebulaev/linkedin-skills/lib/publora_client.py`
  - `activepieces/activepieces/packages/pieces/community/linkedin/src/lib/actions/create-share-update.ts`
  - Blotato `POST https://backend.blotato.com/v2/posts` examples in n8n workflow repos.
- Include retries, idempotency keys, duplicate prevention, and platform IDs.

**Evidence:** Native LinkedIn scheduling, retry records, request identities, prior-success checks, and platform IDs exist. These controls do not establish exactly-once remote delivery or atomic local settlement.

**Remaining:** Unify manual/worker attempt reservation, atomic settlement, stale-owner fencing, and ambiguous-outcome reconciliation first. Then introduce the destination abstraction and verified additional providers.

## 13. Comment/reply agent — Partial

- Generate comments only for approved target posts; keep tone/comment limits separate from post writing.
- Patterns: `cameronking4/ReplyGuy-clone/app/api/cron/campaign/comment/route.ts`, `cameronking4/ReplyGuy-clone/lib/linkedin-api/index.ts`.
- Add stricter anti-spam throttles than post publishing.

**Evidence:** Approval-gated manual comment variants and LinkedIn API posting exist.

**Remaining:** Close the manual remote-success/local-recording gap through shared native publishing recovery first. Then add provider-generated comments and owned background work while retaining human approval and stricter anti-spam limits.

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
