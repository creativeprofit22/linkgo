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

## Future slices

### Approvals + scheduler slice

Adds human approval states, schedule jobs, and publish attempt tracking behind approval gates.

Roadmap sections: 10, 12, 14.

### Metrics + learning slice

Adds post metrics, campaign memory, and learning events.

Roadmap sections: 15.

### Durable workflow engine slice

Adds resumable workflow runs, steps, and progress events.

Roadmap sections: 11, 19.

### Agent runtime + tool schemas slice

Adds model loop, provider abstraction, and typed tool contracts.

Roadmap sections: 1, 2, 17, 18.

### Safety + observability slice

Adds safety limits, audit events, rate-limit events, and error queue.

Roadmap sections: 16, 20.

### Comment/reply agent slice

Adds approval-gated comment candidate and reply generation workflows.

Roadmap section: 13.
