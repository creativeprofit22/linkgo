/**
 * Display-only labels for AI assistant actions (agent tool names). The tool
 * catalog in `src/agent/tools.ts` is the source of truth for which tools exist;
 * `tests/agent-tool-contracts.spec.ts` asserts every catalog tool has a label
 * here. This lives in `src/lib` so feature components can share it without
 * importing agent runtime code.
 */
export const ASSISTANT_ACTION_LABELS: Readonly<Record<string, string>> = {
  research_posts: "Research posts",
  score_relevance: "Score relevance",
  draft_post: "Draft post",
  audit_post: "Audit post",
  score_draft_quality: "Score draft quality",
  schedule_post: "Schedule post",
  collect_metrics: "Collect results",
};

export function getAssistantActionLabel(name: string): string {
  // Own-property check so names like "constructor" never resolve to prototype members.
  return Object.prototype.hasOwnProperty.call(ASSISTANT_ACTION_LABELS, name)
    ? (ASSISTANT_ACTION_LABELS[name] ?? name)
    : name;
}
