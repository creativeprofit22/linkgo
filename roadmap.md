# Linkgo Roadmap

Linkgo is a programmatic LinkedIn growth agent: code handles approved source intake, queues, dedupe, scoring, limits, approvals, scheduling, retries, and metrics; agents handle research, drafting, critique, and learning. Linkgo does not scrape LinkedIn or perform autonomous external actions.

## Audit status

**Audited:** July 31, 2026

**Verification:** Formatting, lint, production builds, all 191 Playwright tests, and all 110 Rust tests pass after Roadmap 3D. Desktop and 320-pixel planner screenshots were reviewed.

- **Implemented:** Every core acceptance statement in the numbered item exists.
- **Partial:** A usable foundation exists, but one or more explicit roadmap outcomes are missing.
- **Not started:** The defining outcome does not exist, even if adjacent foundations do.
- **Blocked:** Implementation requires product, legal, platform-access, or architecture approval.
- **Next:** The partial item currently receiving implementation work.

| Roadmap                               | Status                | Evidence and remaining work                                                                                                                                                                                              |
| ------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Agent runtime                       | **Implemented**       | The provider/model loop and all six Zod tool contracts exist.                                                                                                                                                            |
| 2 Streaming + model layer             | **Partial**           | Provider-neutral execution and event streaming exist; roadmap-specific lifecycle progress and full side-effect integration remain incomplete.                                                                            |
| 3 Campaign + autopilot queue          | **Partial / Blocked** | Campaigns, guarded connector-neutral local intake, recurring backlog planning, and the bounded idempotent Roadmap 3D local planner exist. One compliant production connector is the sole remaining access/terms blocker. |
| 4 Keyword + trend discovery           | **Partial**           | Structured operator-triggered suggestions exist; expansion from real posts and competitor/source imports does not.                                                                                                       |
| 5 Relevance filtering                 | **Partial**           | Source, age, banned-topic, already-contacted, dedupe, scoring, rationale, and optional low-score rejection exist; automated scoring/intake orchestration remains.                                                        |
| 6 Draft generation                    | **Partial**           | Save-gated provider variants exist; default 3–5 enforcement and event/launch/idea/community routing do not.                                                                                                              |
| 7 Humanizer + audit                   | **Partial**           | Deterministic blockers and warnings exist; AI humanizer checks and enforced believable first-person specifics do not.                                                                                                    |
| 8 Quality scoring loop                | **Not started**       | No persisted category scorecard, threshold rewrite, or automatic re-score loop exists. Manual edit and re-audit is only a foundation.                                                                                    |
| 9 Content calendar                    | **Implemented**       | Purpose, angle, format, visual direction, CTA, and the approval bridge exist.                                                                                                                                            |
| 10 Approval gate                      | **Partial**           | Durable human approvals and runtime continuation exist; shareable review links and wait URLs do not.                                                                                                                     |
| 11 Durable workflow engine            | **Partial**           | Typed resumable steps, events, executions, and agent-run artifacts exist; domain artifact flow and owned background jobs do not.                                                                                         |
| 12 Publishing + scheduling            | **Partial**           | Native LinkedIn scheduling, retries, idempotency, and platform IDs exist; a destination abstraction and additional providers do not.                                                                                     |
| 13 Comment/reply agent                | **Partial**           | Approval-gated manual variants and API posting exist; provider-generated comments and background work do not.                                                                                                            |
| 14 LinkedIn API formatting            | **Partial**           | LittleText escaping and text limits exist; unified media/link preflight is incomplete.                                                                                                                                   |
| 15 Metrics + learning loop            | **Partial**           | Manual metrics, reaction/comment refresh, memory, and events exist; automatic winner/loser learning injection is incomplete.                                                                                             |
| 16 Safety, rate limits, observability | **Partial**           | Kill switch, daily caps, retry backoff, local audit history, and the error queue exist; cooldowns, per-account policy, and external telemetry do not.                                                                    |
| 17 Multi-agent workers                | **Partial**           | Role-specific runs exist; parallel research and drafting lanes do not.                                                                                                                                                   |
| 18 Skills + playbooks                 | **Implemented**       | Modular built-ins, overrides, compatibility filtering, and runtime prompt composition exist.                                                                                                                             |
| 19 Persistent task backlog            | **Implemented**       | One campaign-scoped cross-feature backlog now adds recurring due work, owner labels, lifecycle transitions, atomic successors, and bounded history to the durable feature stores.                                        |
| 20 Error queue                        | **Partial**           | A fixable queue and transitions exist; rejected-draft and low-performance automatic items do not.                                                                                                                        |

## Current delivery sequence: Roadmap 3

Roadmap 3 remains **Partial / Blocked** until one compliant production source connector exists. Roadmap 3D's bounded, idempotent local planning slice is complete.

1. **3A — Local source import foundation (complete):** Bounded JSON import, per-row validation, shared candidate dedupe, durable batch outcomes, and reviewable rejection reasons.
2. **3B — Candidate policy guardrails (complete):** Age, source, banned-topic, and already-contacted rules run before enforced intake can write candidate artifacts.
3. **3C — Persistent campaign backlog (complete):** Campaign due work, Operator/Linkgo responsibility, daily/weekly recurrence, immutable history, and atomic future successors.
4. **3D — Autopilot planner (complete):** Connector-neutral local source contracts and a bounded, idempotent native planner create linked scoring backlog/workflow work for active `auto_pilot` campaigns. Research is complete, score is pending, and publishing/commenting remain human approval-gated.
5. **Production connector (blocked):** Complete Roadmap 3 with one remote source connector only after its API access, terms, permissions, and permitted use are verified.

The safe default remains local structured source import. Arbitrary LinkedIn feed search, scraping, browser automation, and autonomous external actions are excluded.

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

**Evidence:** Programmatic source, age, URL/content dedupe, Unicode whole-word banned-topic, and successful prior-contact identity rules run before enforced intake writes candidate artifacts. Relevance scoring, rationale, and optional low-score rejection also exist.

**Remaining:** Add automated relevance-scoring orchestration after planner intake and one compliant production source connector.

## 6. Draft generation — Partial

- Create 3-5 LinkedIn draft variants per approved idea.
- Pattern: `sergebulaev/linkedin-skills/skills/linkedin-post-writer/SKILL.md`.
- Use 2026 hooks: contrarian, curiosity gap, year-pivot, paid-vs-free, self-proving.
- Route by type: events, launches, ideas, community.
- Pattern: `getnao/sylph/.claude/skills/linkedin/SKILL.md`.

**Evidence:** Provider-generated variants exist behind an explicit save gate.

**Remaining:** Enforce 3–5 variants by default and route prompts by events, launches, ideas, and community.

## 7. Humanizer + audit pass — Partial

- Run every draft through deterministic + AI checks before approval.
- Pattern: `sergebulaev/linkedin-skills/skills/linkedin-humanizer/sub-skills/post-audit.md`.
- Block: AI tells, weak hook, external link in body, >3000 chars, too many hashtags, no concrete detail.
- Force believable first-person specifics.
- Pattern: `Core-Mate/OpenGUI/server/apps/backend/src/modules/creator-agent/templates/platform-prompts.ts`.

**Evidence:** Deterministic draft blockers and warnings are implemented.

**Remaining:** Add AI humanizer checks and enforce believable first-person specifics.

## 8. Quality scoring loop — Not started

- Score hook, authenticity, platform fit, specificity, narrative structure.
- Pattern: `Deodat-Lawson/LaunchStack/packages/features/src/marketing-pipeline/generator.ts`.
- If below threshold, rewrite automatically and re-score.

**Remaining:** Persist the category scorecard and implement the threshold-driven rewrite and automatic re-score loop. Manual edit and re-audit does not complete this item.

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

**Evidence:** Typed resumable steps, workflow events and executions, and agent-run artifacts exist.

**Remaining:** Complete domain artifact flow and owned background jobs.

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
