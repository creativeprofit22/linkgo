# Roadmap Mapping

This document maps `roadmap.md` to implementation slices.

## Implemented slices

### Campaigns slice

Roadmap coverage:

- Section 3: Campaign + autopilot queue.
- Section 4 foundation: manual keywords, with generated and learned sources reserved.
- Section 16 foundation: conservative post/comment limits stored per campaign.

Implemented now:

- Campaign tables and keyword table.
- Campaign CRUD/listing data access.
- Campaign hook and UI.
- Autopilot intent flag only.

Automation is not implemented in this slice.

### Candidate queue slice

Roadmap coverage:

- Section 3: manual candidate post intake for existing campaigns.
- Section 4: AI-assisted keyword/trend/source-prompt discovery as saved local suggestions.
- Section 5: operator-triggered relevance scoring with rationale storage for triage.

Implemented now:

- Target post, candidate post, dedupe key, and candidate discovery tables.
- Manual LinkedIn post add flow.
- Per-campaign duplicate prevention by normalized URL and content hash.
- Queue cards grouped by triage status.
- Status updates for `new`, `shortlisted`, `rejected`, and `drafted`.
- Dry-run/provider researcher suggestions persisted through `research_posts`.
- Dry-run/provider scorer outputs applied through `score_relevance` after campaign ownership validation.
- Keyword suggestion promotion into generated campaign keywords and suggestion dismissal.

LinkedIn scraping, autonomous scoring runs, autonomous commenting, and autonomous publishing are not implemented in this slice.

### Drafting + audit slice

Roadmap coverage:

- Section 6: draft generation foundation via manual variants.
- Section 7: deterministic audit checks for draft safety.
- Section 8: rewrite-loop foundation via edit-and-re-audit, without AI loops.

Implemented now:

- Draft, draft variant, and draft audit tables.
- Manual one-to-five variant creation for non-rejected candidates.
- Deterministic audit findings for required text, length, links, hashtags, hook strength, and specificity.
- Variant edit-and-re-audit flow.
- Variant status actions for selected, rejected, and draft reset.
- Drafts tab with campaign filtering, summary cards, draft cards, and archive action.

AI draft generation and AI audit/rewrite loops are not implemented in this slice.

### Approvals slice

Roadmap coverage:

- Section 10: human approval records for selected clean draft variants.
- Section 12 foundation: local schedule job records behind approval status.
- Section 14 foundation: manual publish-attempt history.

Implemented now:

- Approval records for selected clean draft variants.
- Local schedule job records behind approval status for operator scheduling.
- Manual publish-attempt history.
- LinkedIn LittleText escaped preview for API-safe commentary review.
- Explicit operator-triggered LinkedIn API publishing for approved or scheduled posts when LinkedIn OAuth is connected.

Autonomous LinkedIn API publishing, LinkedIn API commenting, and scheduler worker execution are handled outside this approvals slice.

### Metrics + learning slice

Roadmap coverage:

- Section 15: post metrics, campaign memory foundation, and conservative LinkedIn social metadata refresh.

Implemented now:

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

Implemented now:

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

Implemented now:

- Agent run, tool call, and runtime event tables.
- Six Zod tool contracts: `research_posts`, `score_relevance`, `draft_post`, `audit_post`, `schedule_post`, and `collect_metrics`.
- Provider-independent runtime interfaces, native Tauri provider adapter, and deterministic `dry_run` provider.
- Provider-backed execution after explicit credential connection, with model credentials, provider payload construction, tool definitions, and transport handling kept behind the Tauri command boundary.
- Provider-aware Agent Runtime tab with contract visibility and local run history.
- Approval-gated `schedule_post` behavior.
- Archived-campaign mutation blocking.

LinkedIn scraping, comments, and autonomous content generation are not implemented in this slice.

### Skills + playbooks slice

Roadmap coverage:

- Section 18: reusable LinkedIn playbooks stored as modular prompt contracts.
- Sections 6, 7, 9, 13, and 15: writer, humanizer, calendar, commenter guidance, and analyst prompt modules.

Implemented now:

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

Implemented now:

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

Implemented now:

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

Implemented now:

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

Implemented now:

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

Implemented now:

- Tauri v2 autostart plugin registration and permissions.
- Settings page Startup card with one launch-on-login switch.
- Singleton `app_settings` mirror row for local preference sync/error audit.
- Playwright coverage for render, enable, disable, persistence, and failure rollback.

Explicit exclusions: no scheduler execution after process quits, no hidden startup args, no daemon, and no automatic job execution on login.

## Future slices

Future slices will add external integrations and automation only behind explicit approval gates. Remaining comment work is limited to richer LinkedIn surfaces after product access is available; organization-page analytics and after-quit schedulers remain future work.
