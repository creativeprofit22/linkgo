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
- Section 4: source keyword capture for future discovery loops.
- Section 5: relevance score and rationale storage for triage.

Implemented now:

- Target post, candidate post, and dedupe key tables.
- Manual LinkedIn post add flow.
- Per-campaign duplicate prevention by normalized URL and content hash.
- Queue cards grouped by triage status.
- Status updates for `new`, `shortlisted`, `rejected`, and `drafted`.

Scraping, AI scoring, commenting, and publishing are not implemented in this slice.

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

- Section 15: manual post metrics and campaign memory foundation.

Implemented now:

- Manual metric snapshots for published approvals.
- Campaign memory notes approved by a human operator.
- Append-only learning events for metric and memory actions.
- Metrics tab with campaign filtering, summaries, metric cards, memory cards, and event stream.

LinkedIn API collection, automatic refresh, AI learning loops, and background metric jobs are not implemented in this slice.

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
- Provider-independent runtime interfaces, GG AI adapter, and deterministic `dry_run` provider.
- Provider-backed GG AI execution after explicit credential connection.
- Provider-aware Agent Runtime tab with contract visibility and local run history.
- Approval-gated `schedule_post` behavior.
- Archived-campaign mutation blocking.

LinkedIn scraping, comments, and autonomous content generation are not implemented in this slice.

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

OS launch-on-login, running after the Linkgo process quits, LinkedIn API commenting, scraping, and autonomous content generation are not implemented.

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

## Future slices

Future slices will add external integrations and automation only behind explicit approval gates. Remaining comment work is limited to richer LinkedIn surfaces after product access is available; OS-level launch-on-login and after-quit schedulers remain future work.
