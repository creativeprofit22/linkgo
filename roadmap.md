# Linkgo Roadmap

Linkgo is a programmatic LinkedIn growth agent: code handles scraping, queues, dedupe, scoring, limits, approvals, scheduling, retries, and metrics; agents handle research, drafting, critique, and learning.

## 1. Agent runtime

- Use `@kenkaiiii/gg-agent` style loop: model calls typed tools, receives results, loops until done.
- Pattern: `gg-framework/packages/gg-agent/src/agent-loop.ts`, `gg-framework/packages/gg-agent/src/types.ts`.
- Build tools as Zod schemas: `research_posts`, `score_relevance`, `draft_post`, `audit_post`, `schedule_post`, `collect_metrics`.

## 2. Streaming + model layer

- Use a provider-neutral wrapper so models can swap without changing workflow code.
- Pattern: `gg-framework/packages/gg-ai/src/types.ts`, `gg-framework/packages/gg-ai/README.md`.
- Stream progress events into UI: researching, drafting, auditing, waiting approval, scheduled.

## 3. Campaign + autopilot queue

- Store campaigns with `autoPilot`, keywords, platform prefs, voice, tone, product, audience.
- Pattern: `cameronking4/ReplyGuy-clone/app/api/cron/campaign/post/route.ts`.
- Cron finds active campaigns, fetches recent target posts, batches work, stores candidates.

## 4. Keyword + trend discovery

- Generate seed keywords from campaign context, then expand from real posts and competitors.
- Pattern: `cameronking4/ReplyGuy-clone/app/actions/ai.ts` `generateCampaignKeywords`.
- Output must be structured JSON via Zod, not loose text.

## 5. Relevance filtering

- Batch candidate posts, dedupe, score relevance, reject weak matches before drafting.
- Pattern: `cameronking4/ReplyGuy-clone/app/actions/ai.ts` `filterRelevantPostsInBatches`.
- Programmatic rules first: source, age, duplicate URL/text, banned topics, already-contacted.

## 6. Draft generation

- Create 3-5 LinkedIn draft variants per approved idea.
- Pattern: `sergebulaev/linkedin-skills/skills/linkedin-post-writer/SKILL.md`.
- Use 2026 hooks: contrarian, curiosity gap, year-pivot, paid-vs-free, self-proving.
- Route by type: events, launches, ideas, community.
- Pattern: `getnao/sylph/.claude/skills/linkedin/SKILL.md`.

## 7. Humanizer + audit pass

- Run every draft through deterministic + AI checks before approval.
- Pattern: `sergebulaev/linkedin-skills/skills/linkedin-humanizer/sub-skills/post-audit.md`.
- Block: AI tells, weak hook, external link in body, >3000 chars, too many hashtags, no concrete detail.
- Force believable first-person specifics.
- Pattern: `Core-Mate/OpenGUI/server/apps/backend/src/modules/creator-agent/templates/platform-prompts.ts`.

## 8. Quality scoring loop

- Score hook, authenticity, platform fit, specificity, narrative structure.
- Pattern: `Deodat-Lawson/LaunchStack/packages/features/src/marketing-pipeline/generator.ts`.
- If below threshold, rewrite automatically and re-score.

## 9. Content calendar

- Turn approved ideas into slots with purpose, angle, format, visual direction, and CTA.
- Pattern: `stevenflanagan1/social-ai-team/skills/content-calendar/SKILL.md`.
- No filler slots; every post must serve reach, trust, proof, conversion, or community.

## 10. Approval gate

- Drafts can be automatic; publishing requires human approval.
- Pattern: `CopilotKit/CopilotKit/packages/runtime/src/agent/converters/aisdk.ts` tool approval interrupts.
- Add review links / wait URLs for approvals.
- Pattern: `n8n-io/n8n/packages/cli/src/webhooks/waiting-webhooks.ts`.
- Store states: `drafted -> needs_review -> approved -> scheduled -> published -> measured`.

## 11. Durable workflow engine

- Represent the pipeline as typed steps with resumable state: research -> score -> draft -> audit -> approve -> schedule -> measure.
- Patterns: `kaiban-ai/KaibanJS/packages/workflow/src/workflow.ts`, `jwynia/agent-skills/skills/tech/ai/mastra-hono/assets/workflow-template.ts`.
- Keep long jobs resumable; expose step progress to UI.

## 12. Publishing + scheduling

- Start with scheduler abstraction; hide LinkedIn/Publora/Blotato differences behind one tool.
- Patterns:
  - `sergebulaev/linkedin-skills/lib/publora_client.py`
  - `activepieces/activepieces/packages/pieces/community/linkedin/src/lib/actions/create-share-update.ts`
  - Blotato `POST https://backend.blotato.com/v2/posts` examples in n8n workflow repos.
- Include retries, idempotency keys, duplicate prevention, and platform IDs.

## 13. Comment/reply agent

- Generate comments only for approved target posts; keep tone/comment limits separate from post writing.
- Patterns: `cameronking4/ReplyGuy-clone/app/api/cron/campaign/comment/route.ts`, `cameronking4/ReplyGuy-clone/lib/linkedin-api/index.ts`.
- Add stricter anti-spam throttles than post publishing.

## 14. LinkedIn API formatting

- Escape LinkedIn LittleText characters before publishing.
- Pattern: `activepieces/activepieces/packages/pieces/community/linkedin/src/lib/common/index.ts` `santizeText`.
- Enforce char limits and media/link rules programmatically.

## 15. Metrics + learning loop

- Collect impressions, reactions, comments, profile visits, CTR when available.
- Feed winners/losers back into campaign memory.
- Pattern: `gg-framework/packages/gg-agent/src/types.ts` `transformContext` for compact memory injection.

## 16. Safety, rate limits, observability

- Add per-account daily caps, cooldowns, retry backoff, audit logs, and kill switches.
- Pattern: `gg-framework/packages/gg-agent/src/agent-loop.ts` retry/error handling; `gg-framework/packages/ggcoder/src/core/logger.ts` debug logging.
- Default to conservative limits; scale only after metrics prove quality.

## 17. Multi-agent workers

- Split work: researcher, drafter, auditor, scheduler, analyst.
- Pattern: `gg-framework/packages/ggcoder/src/tools/subagent.ts`, `gg-framework/packages/gg-boss/src/orchestrator.ts`.
- Run research and drafting in parallel; keep publishing serial and approval-gated.

## 18. Skills + playbooks

- Store reusable LinkedIn playbooks as skills: writer, humanizer, calendar, commenter, analyst.
- Pattern: `gg-framework/packages/ggcoder/src/core/skills.ts`, `gg-framework/packages/ggcoder/src/tools/skill.ts`.
- Keep prompts modular instead of one giant system prompt.

## 19. Persistent task backlog

- Keep weekly jobs, pending approvals, metric reviews, and failed publishes resumable.
- Pattern: `gg-framework/packages/gg-boss/src/boss-store.ts`, `gg-framework/packages/gg-boss/src/boss-tasks-overlay.tsx`.
- Use direct dispatch for one-offs; backlog for recurring campaigns.

## 20. Error queue

- Failed publishes, rejected drafts, and low-performing posts become fixable queue items.
- Pattern: `gg-framework/packages/gg-pixel` and `gg-framework/CLAUDE.md` Pixel section.
- Statuses: `open -> in_progress -> awaiting_review -> resolved/failed`.
