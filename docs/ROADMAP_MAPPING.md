# Roadmap Mapping

This document maps `roadmap.md` to implementation slices. Roadmaps 1, 9, 18, and 19 are implemented; Roadmap 8 is Partial (8A); the remaining items are partial. Roadmap 3 remains partial and blocked after completed slices 3A, 3B, 3C, and 3D; one compliant production source connector is the sole remaining gate.

## Delivered slices and partial foundations

### Roadmap 8A attended draft quality loop

Migration 33 adds durable quality runs, immutable attempts, and five canonical category scores. The Drafts UI exposes an explicit confirmation-gated loop after canonical AI audit readiness, a fixed threshold of 70, at most two rewrites, automatic deterministic/AI re-audit and re-score, stale recovery, and explicit resume. New approval creation requires the current revision to pass both AI audit and quality threshold. Planner/background quality ownership, configurable thresholds, and any automatic approval/publish action are excluded.

### Campaigns slice

Roadmap coverage:

- Section 3: Campaign + autopilot queue.
- Section 4 foundation: manual keywords, with generated and learned sources reserved.
- Section 16 foundation: conservative post/comment limits stored per campaign.

Delivered in this slice:

- Campaign tables and keyword table.
- Campaign CRUD/listing data access.
- Campaign hook and UI.
- Opt-in local planner eligibility flag.

The campaign slice stores eligibility only. Roadmap 3D consumes it through a separately started local worker; it does not authorize external actions.

### Candidate queue slice

Roadmap coverage:

- Section 3: manual candidate post intake for existing campaigns.
- Section 4: AI-assisted keyword/trend/source-prompt discovery as saved local suggestions.
- Section 5: operator-triggered relevance scoring with rationale storage for triage.

Delivered in this slice:

- Target post, candidate post, dedupe key, and candidate discovery tables.
- Manual LinkedIn post add flow.
- Per-campaign duplicate prevention by normalized URL and content hash.
- Queue cards grouped by triage status.
- Status updates for `new`, `shortlisted`, `rejected`, and `drafted`.
- Dry-run/provider researcher suggestions persisted through `research_posts`.
- Dry-run/provider scorer outputs applied through `score_relevance` after campaign ownership validation.
- Keyword suggestion promotion into generated campaign keywords and suggestion dismissal.

LinkedIn scraping, autonomous scoring runs, autonomous commenting, and autonomous publishing are not implemented in this slice.

### Roadmap 3A local source import slice

Roadmap coverage:

- Section 3 foundation: bounded local source-post intake for existing campaigns.
- Section 5 foundation: every accepted row reuses normalized URL/content-hash dedupe and candidate creation.
- Section 16 foundation: bounded, reviewable local input with no external action.

Delivered in this slice:

- A JSON-array import boundary for 1–50 approved source-post rows.
- Per-row validation with valid rows preserved when neighboring rows are rejected.
- Durable import batches and item outcomes for accepted, duplicate, and rejected rows.
- Shared Candidate Queue normalization, target-post reuse, and dedupe behavior.
- Campaign-scoped import history with operator-safe reasons.

The import is local only. It does not scrape LinkedIn, fetch target posts, call a model, draft, approve, comment, schedule, or publish. Roadmap 3D now consumes terminal batches through the connector-neutral boundary; a compliant production connector remains blocked.

### Roadmap 3B candidate policy guardrails

Roadmap coverage:

- Section 3: one campaign-scoped safety gate before bulk or unattended candidate intake.
- Section 5: programmatic source, age, banned-topic, already-contacted, and existing dedupe rules.
- Section 16: conservative defaults, durable classifications, and reviewable rejection reasons.

Delivered in this slice:

- Migration 23 with campaign age policy, normalized banned topics, and source-import policy classifications.
- Deterministic HTTPS LinkedIn source, absolute timestamp/age, Unicode whole-word topic, and successful-contact identity checks.
- Policy enforcement at the shared candidate transaction boundary before candidate artifacts are written.
- Local JSON imports on the enforced path; attended single-candidate entry remains an explicit operator override.
- Queue policy summary/editor with archived read-only, retry, validation, keyboard, and responsive states.
- Policy-labeled import history and transaction rollback coverage for mixed batches.

Roadmap 3D now consumes this policy-enforced boundary. A compliant production connector remains excluded. No scraping, remote lookup, model call, drafting, commenting, scheduling, or publishing was added.

### Roadmap 3C persistent campaign backlog

Roadmap coverage:

- Section 3: campaign-scoped due work and visible Operator/Linkgo responsibility.
- Section 19: one recurring cross-feature backlog for manual planning.
- Section 16: immutable terminal history, archived read-only enforcement, and transactional recurrence safety.

Delivered in this slice:

- Migrations 24 through 26 with required due times, explicit IANA recurrence zones, eight work categories, two owner labels, five lifecycle statuses, one-off/daily/weekly recurrence, and bounded history indexes.
- Atomic, stored-zone recurring completion with one future successor, daylight-saving wall-clock preservation, and missed-interval coalescing.
- Manual create, edit, start, block, resume, complete, and confirmed cancel flows.
- Cross-campaign Backlog tab with summary counts, campaign/owner/open-history filters, grouped due work, bounded history, and archived guidance.
- Data-boundary transition checks, request-race protection, rollback injection, responsive and accessibility coverage.
- Roadmap 19 completion through a durable cross-feature backlog complementing workflow, scheduler, approval, metric refresh, and error stores.

Manually created Linkgo ownership remains a responsibility label. Roadmap 3D adds explicit linkage only for planner-created scoring rows. Roadmap 3C itself adds no connector, model run, workflow execution, drafting, scheduling, publishing, commenting, background polling, after-quit execution, or notification.

### Roadmap 3D local Autopilot Planner

Roadmap coverage:

- Section 3: active autopilot campaigns convert completed approved source batches into bounded local work.
- Section 11: one queued seven-step workflow per eligible source batch, with research complete and score pending.
- Section 16: global kill-switch gating, idempotent transactions, bounded worker ticks, and append-only local events.
- Section 19: explicit source-to-backlog-to-workflow linkage.

Delivered in this slice:

- Migration 27 with singleton planner settings, unique source-batch plans, planner events, constraints, and eligibility/history indexes.
- Closed connector-neutral source registry with `local_json` as the only available non-fetching connector.
- Native status/start/stop/tick commands and a while-open, disabled-by-default worker.
- Oldest-first bounded selection and in-transaction revalidation.
- Atomic creation of a Linkgo scoring backlog item, queued score-first workflow, seven canonical steps, workflow events, plan linkage, and planner event.
- Durable skipped plans for batches whose accepted candidates were later deleted.
- Autopilot dashboard with controls, filtering, counts, source-to-work cards, event history, failure recovery, and explicit local-only scope.
- Backlog and Workflow origin projections without changing executor or external-action behavior.
- Real-SQLite Rust tests and Playwright coverage for bounds, exclusions, idempotency, races, rollback, kill switch, stale responses, accessibility, and narrow reflow.

Roadmap 3D calls no model, LinkedIn API, remote connector, scraper, browser automation, scheduler publish command, or comment command. Roadmap 3 remains partial and blocked only until one production connector passes API-access, terms, permissions, and permitted-use review.

### Roadmap 5A planner-linked relevance scoring

Roadmap coverage:

- Section 5: attended scoring of the exact planner candidate batch with rationale and optional low-score rejection.
- Section 11: durable `candidate_post` artifact flow, race-safe attempts, and workflow reconciliation.
- Section 16: connected-provider confirmation, bounded context, global kill-switch gating, and atomic rollback.
- Section 19: workflow-owned lifecycle projection into the linked one-off scoring backlog item.

Delivered in this slice:

- Migration 29 with bounded `agent_runs.input_context_json`, expanded workflow artifacts, preservation, and existing-plan candidate backfill.
- One candidate artifact per surviving accepted planner candidate in the native materialization transaction.
- Strict relevance context and exact score-set contracts; synthetic score fabrication is removed.
- `BEGIN IMMEDIATE` claim and score-write transactions with duplicate-attempt and stale/cross-campaign protection.
- Connected-provider `Score batch` confirmation in Workflows with visible scope, model, threshold, and conservative rejection default.
- No-provider, no-artifact, all-removed, all-scored, archived, kill-switch, provider-failure, retry, and atomic-validation states.
- Autopilot scorer provenance and workflow-owned read-only Backlog projections.
- Rust migration/planner tests and Playwright coverage across scope, context, success, rollback, retries, concurrency, responsive behavior, and accessibility.

Roadmap 5 remains partial because unattended/background scoring ownership and the production connector are not delivered. Roadmap 11 gains candidate artifact flow but remains partial. The native planner stays model-free and never invokes this attended executor path.

### Roadmap 6A planner-linked draft generation

Roadmap coverage:

- Section 6: exactly 3–5 provider-assisted variants with fixed event/launch/idea/community intent routes.
- Section 11: scored planner candidate artifacts flow into a save-gated draft step and saved draft artifact.
- Section 16: durable request-before-provider execution, bounded untrusted reference context, duplicate active-step prevention, and atomic rollback.

Delivered in this slice:

- Migration 30 with checked content intent, linked request provenance, new-request count guards, active-step uniqueness, and `draft` workflow artifacts.
- Four code-owned intent prompt routes and exact `draft_post` input/output validation.
- Optional workflow selection for eligible scored candidate artifacts while retaining manual and ad-hoc drafting.
- Successful generation held at `draft` until explicit save; failure/dismissal blocks and terminal retry resumes.
- One save transaction for draft/variant/audit writes, request settlement, artifact creation, workflow events, and advancement to `audit`.
- Draft/request intent and workflow provenance UI, draft artifact chips, removed-draft reporting, 320-pixel reflow, and accessibility coverage.

Roadmap 6A adds no background generation, AI audit/rewrite loop, approval creation, scheduling, publishing, scraping, or production source connector.

### Drafting + audit slice

Roadmap coverage:

- Section 6: manual and operator-triggered AI-assisted draft variants.
- Section 7: deterministic checks plus a callable revision-scoped AI humanizer audit.
- Section 8: rewrite-loop foundation via edit-and-re-audit, without AI loops.
- Sections 17 and 18: drafter and auditor role/playbook paths through the agent runtime.

Delivered in this slice:

- Draft, draft variant, deterministic audit, generation request, revision-scoped AI audit run, and normalized AI finding storage.
- Manual one-to-five variant creation for non-rejected candidates.
- Operator-triggered dry-run/provider draft generation through `draft_post`.
- Save-gated generated drafts that reuse `createDraft` and deterministic audits.
- Deterministic audit findings for required text, length, links, hashtags, hook strength, and specificity.
- Callable `audit_post` execution with exact durable identity and canonical-text validation, six-category atomic completion, and stale-revision rejection.
- Bounded startup reconciliation for stale reserved/linked audits and orphaned auditor agents, including nonterminal-agent failure settlement and approval-checkpoint cleanup.
- Migration, schema-contract, runtime, transaction-boundary, recovery, retry, and evidence-preservation tests.
- Variant edit-and-re-audit flow.
- Variant status actions for selected, rejected, and draft reset.
- Drafts tab with campaign filtering, summary cards, draft cards, and archive action.

Roadmap 7 remains partial because the AI audit has no operator UI or workflow-owned automatic execution, and findings do not yet enforce believable first-person specifics before approval. Automatic AI rewrite/re-score loops, LinkedIn scraping, autonomous approval creation, scheduling, publishing, and commenting are not implemented in this slice.

### Approvals slice

Roadmap coverage:

- Section 10: human approval records for selected clean draft variants.
- Section 12 foundation: local schedule job records behind approval status.
- Section 14 foundation: manual publish-attempt history.

Delivered in this slice:

- Approval records for selected clean draft variants.
- Local schedule job records behind approval status for operator scheduling.
- Manual publish-attempt history.
- LinkedIn LittleText escaped preview for API-safe commentary review.
- Visible linked agent-run counts and checkpoint-removal consequences before approval rejection.
- Explicit operator-triggered LinkedIn API publishing for approved or scheduled posts when LinkedIn OAuth is connected.

Autonomous LinkedIn API publishing, LinkedIn API commenting, and scheduler worker execution are handled outside this approvals slice.

### Content calendar slice

Roadmap coverage:

- Section 9: content calendar planning for approved LinkedIn drafts.
- Section 10 bridge: calendar slots are created only from human-approved approvals.
- Sections 12 and 16 bridge: scheduling uses the existing approval scheduling path with kill switch, rate limit, idempotency, and status checks.

Delivered in this slice:

- `content_calendar_slots` table with one slot per approval.
- Required purpose, local slot time, timezone, format, angle, visual direction, CTA, and optional notes.
- Calendar tab between Approvals and Scheduler with all-campaign planning, campaign filtering, summary cards, create/edit/archive actions, and schedule-slot action.
- Slot lists joined to campaign, approval, draft variant, source post, schedule job, and successful publish attempt context.
- Lifecycle labels derived from approval, schedule job, publish attempt, and archived slot state.

Drag-and-drop grids, recurring plans, autonomous calendar generation, media asset management, scraping, and autonomous scheduling/publishing are not implemented in this slice.

### Metrics + learning slice

Roadmap coverage:

- Section 15: post metrics, campaign memory foundation, and conservative LinkedIn social metadata refresh.

Delivered in this slice:

- Manual metric snapshots for published approvals.
- Opt-in LinkedIn social metadata refresh for published approvals with resolvable LinkedIn URNs.
- API snapshots collect reactions/comments only and label impressions/click metrics as unavailable.
- Durable local metric refresh settings, jobs, locks, retry metadata, and refresh events.
- Campaign memory notes approved by a human operator.
- Append-only learning events for metric and memory actions.
- Metrics tab with campaign filtering, summaries, refresh controls, metric cards, source badges, memory cards, and event stream.

LinkedIn scraping, member-post impression/click analytics, organization analytics, AI learning loops, and after-quit metric jobs are not implemented in this slice.

### Durable workflow engine slice

Roadmap coverage:

- Section 11: durable workflow engine with typed resumable pipeline steps.
- Section 19: persistent task backlog foundation through resumable runs and progress events.

Delivered in this slice:

- Workflow run, step, event, and step-execution tables.
- Manual content pipeline state machine: `research -> score -> draft -> audit -> approve -> schedule -> measure`.
- Foreground executor controls that launch linked role-specific agent runs and stop at approvals.
- Workflows tab with campaign filtering, summary cards, step controls, and event history.
- Archived-campaign mutation blocking.

Workflow-owned background jobs, LinkedIn API commenting, and generic workflow building are not implemented in this slice.

### Agent runtime + tool schemas slice

Roadmap coverage:

- Section 1: local model/tool loop contracts.
- Section 2: streaming/provider layer foundation.
- Section 17: role-based multi-agent worker foundation.
- Section 18: typed skill/playbook slots through tool metadata.

Delivered in this slice:

- Agent run, tool call, and runtime event tables.
- Six Zod tool contracts: `research_posts`, `score_relevance`, `draft_post`, `audit_post`, `schedule_post`, and `collect_metrics`.
- Provider-independent runtime interfaces, native Tauri provider adapter, and deterministic `dry_run` provider.
- Provider-backed execution after explicit credential connection, with model credentials, provider payload construction, tool definitions, and transport handling kept behind the Tauri command boundary.
- Provider-aware Agent Runtime tab with contract visibility and local run history.
- Approval-gated `schedule_post` behavior.
- Archived-campaign mutation blocking.

LinkedIn scraping, comments, and autonomous/background content generation are not implemented in this slice; operator-triggered save-gated draft generation lives in Drafting + audit.

### Skills + playbooks slice

Roadmap coverage:

- Section 18: reusable LinkedIn playbooks stored as modular prompt contracts.
- Sections 6, 7, 9, 13, and 15: writer, humanizer, calendar, commenter guidance, and analyst prompt modules.

Delivered in this slice:

- Built-in TypeScript playbook definitions for LinkedIn Writer, LinkedIn Humanizer, Content Calendar, LinkedIn Commenter, and Campaign Analyst.
- `agent_runs.playbook_key` persistence for selected runtime playbooks.
- `agent_playbook_overrides` for local enable/disable state and bounded custom instructions.
- Playbooks tab for cards, role/tool/roadmap badges, custom overrides, and guidance-only commenter visibility.
- Agent Runtime playbook selection filtered by compatible role and enabled runtime state.
- Provider and dry-run prompt assembly that layers selected playbook instructions on top of non-removable safety lines.

Scraping, autonomous publishing, autonomous commenting, browser automation, and external telemetry are not implemented in this slice.

### Safety + observability slice

Roadmap coverage:

- Section 16: conservative daily scheduling caps and emergency stop controls.
- Section 20: local observability through audit history, rate-limit events, and an operator error queue.

Delivered in this slice:

- Global app-level kill switch for local schedule starts and agent dry-run starts.
- Daily post scheduling cap enforcement using each campaign's `daily_post_limit`.
- Append-only safety audit events and rate-limit decisions.
- Error queue items for failed publish attempts, rejected approvals, and failed agent runs.
- Safety tab with summaries, campaign filtering, kill switch controls, event history, and status transitions.

External telemetry and non-approved autonomous actions are not implemented in this slice.

### Comment/reply agent slice

Roadmap coverage:

- Section 13: comment/reply agent.
- Section 16 foundation: conservative daily comment-limit enforcement using `campaigns.daily_comment_limit` and `rate_limit_events.action = 'comment'`.

Delivered in this slice:

- Local comment threads for eligible shortlisted or drafted candidate posts.
- One-to-three manual reply variants with deterministic audit findings.
- Human review statuses before a comment can be posted or manually marked posted.
- Explicit operator-confirmed LinkedIn API comment posting for approved threads with resolvable target URNs.
- Manual posted/failed attempt history as fallback.
- Failed API/manual attempts create error queue items with `source_type = 'manual'`.
- Global kill switch and daily comment caps block successful posting records before native API submission.
- Comments tab with campaign filtering, summaries, variant preview, audit display, review actions, API posting, and attempt dialogs.

LinkedIn scraping, background comment workers, API comment reads, rich comment media, and automated comment posting are not implemented in this slice.

### Background scheduler slice

Roadmap coverage:

- Section 12: due-job execution, retry metadata, idempotency, duplicate prevention, and platform IDs through publish attempts.
- Section 14: scheduled LinkedIn publishing using the same OAuth command path as explicit operator publishing.
- Section 16: global kill switch enforcement and safety audit history for scheduled publishing.
- Section 20: scheduler events and error queue items for terminal failures.

Delivered in this slice:

- Migration version `12` adds scheduler settings, retry/lock fields on `schedule_jobs`, scheduler events, and due-job indexes.
- Native Tauri scheduler commands: status, start, stop, and bounded tick.
- Opt-in worker loop that runs while Linkgo is open or hidden to tray.
- Due approved scheduled LinkedIn posts publish through the shared native OAuth helper.
- Retryable failures keep schedules active with backoff; terminal failures return approvals to `approved` and create error queue items.
- Scheduler tab with status, start/stop, manual tick, pending due jobs, recent events, and scheduler-linked attempts.

Launch-on-login can open Linkgo, but running after the Linkgo process quits, LinkedIn API commenting, scraping, and autonomous content generation are not implemented.

### Integrations + provider auth foundation

Roadmap coverage:

- Section 1: provider connection foundation.
- Section 2: streaming provider layer connection status.
- Section 10: OAuth foundation for approval-gated external actions.
- Section 16: credential-health visibility before external actions.
- Sections 17 and 18: provider-ready role agents and typed tools.

Delivered in this slice:

- Full installed GG AI provider catalog: Anthropic, Xiaomi, OpenAI, Gemini, Z.AI/GLM, Moonshot, DeepSeek, OpenRouter, Sakana, and MiniMax.
- Linkgo-only custom API and LinkedIn provider catalog entries.
- Native Tauri credential storage boundary for API keys and OAuth credentials.
- LinkedIn OAuth start, manual code submission, state validation, token exchange path, refresh path, logout, and status checks.
- Connected LinkedIn member metadata backfill through OIDC userinfo.
- Integrations tab with provider cards and no secret rendering.
- OAuth-backed LinkedIn post publishing command used only by explicit approved/scheduled post actions.

Autonomous content generation, autonomous LinkedIn commenting, scraping, arbitrary browser automation, and external telemetry are not implemented.

### OS launch-on-login settings slice

Roadmap coverage:

- App-level operating-system startup preference for opening Linkgo at login.

Delivered in this slice:

- Tauri v2 autostart plugin registration and permissions.
- Settings page Startup card with one launch-on-login switch.
- Singleton `app_settings` mirror row for local preference sync/error audit.
- Playwright coverage for render, enable, disable, persistence, and failure rollback.

Explicit exclusions: no scheduler execution after process quits, no hidden startup args, no daemon, and no automatic job execution on login.

### Desktop release-candidate verification (Roadmap release prerequisite)

Roadmap coverage:

- Release prerequisite "Complete verification": real native boundaries on a named target OS in addition to mocked browser flows.

Delivered:

- Identifier-scoped keyring service (`src-tauri/src/auth/storage.rs`) and an isolated RC test identity (`src-tauri/tauri.rc-test.conf.json`, `bun run tauri:build:rctest`).
- Ignored fixture writers for pre-upgrade and crash-recovery databases (`src-tauri/src/release_fixtures.rs`).
- Real-app CDP harness (`tests-desktop/`, `bun run test:desktop`) outside the default gate.
- Operator backup/restore procedure (`docs/operations/backup-restore.md`).
- Evidence: `docs/verification/2026-09-27-desktop-release-candidate.md`.

Explicit exclusions: Windows 10 x64 NSIS only; live AI, LinkedIn OAuth/publishing, MSI install, Windows 11/ARM, macOS and Linux are unverified. No in-app backup feature.

## Future slices

Future slices will add external integrations and automation only behind explicit approval gates. Remaining comment work is limited to richer LinkedIn surfaces after product access is available; organization-page analytics and after-quit schedulers remain future work.
