import {
  auditPostInputSchema,
  auditPostOutputSchema,
  collectMetricsInputSchema,
  collectMetricsOutputSchema,
  draftPostInputSchema,
  draftPostOutputSchema,
  researchPostsInputSchema,
  researchPostsOutputSchema,
  schedulePostInputSchema,
  schedulePostOutputSchema,
  scoreRelevanceInputSchema,
  scoreRelevanceOutputSchema,
  type AuditPostInput,
  type CollectMetricsInput,
  type DraftPostInput,
  type ResearchPostsInput,
  type SchedulePostInput,
  type ScoreRelevanceInput,
} from "@/agent/schemas";
import {
  applyRelevanceScoresFromTool,
  insertDiscoveryItemsFromTool,
} from "@/features/candidate-queue/data";
import type {
  AgentToolContract,
  AgentToolExecutionContext,
  AgentToolMetadata,
  AgentToolName,
  AgentToolRegistry,
} from "@/agent/types";

export const AGENT_TOOL_METADATA = [
  {
    name: "research_posts",
    label: "Research posts",
    description:
      "Collects operator-provided campaign context into local candidate summaries; it does not scrape LinkedIn.",
    roadmapSection: "1, 2, 17, 18",
    requiresApproval: false,
    stepKeys: ["research"],
  },
  {
    name: "score_relevance",
    label: "Score relevance",
    description:
      "Scores candidate IDs against campaign fit using validated local inputs and rationale output.",
    roadmapSection: "1, 5, 17",
    requiresApproval: false,
    stepKeys: ["score"],
  },
  {
    name: "draft_post",
    label: "Draft post",
    description:
      "Creates exactly 3–5 routed draft variants for later explicit human save, editing, and review.",
    roadmapSection: "1, 6, 18",
    requiresApproval: false,
    stepKeys: ["draft"],
  },
  {
    name: "audit_post",
    label: "Audit post",
    description:
      "Returns pass, warning, and block findings for deterministic or future model audit rules.",
    roadmapSection: "1, 7, 8",
    requiresApproval: false,
    stepKeys: ["audit"],
  },
  {
    name: "schedule_post",
    label: "Schedule post",
    description:
      "Requests a local schedule action behind human approval; it never publishes content.",
    roadmapSection: "1, 10, 12",
    requiresApproval: true,
    stepKeys: ["schedule"],
  },
  {
    name: "collect_metrics",
    label: "Collect metrics",
    description:
      "Records the shape of a metric collection request without fetching external metrics.",
    roadmapSection: "1, 15, 17",
    requiresApproval: false,
    stepKeys: ["measure"],
  },
] satisfies AgentToolMetadata[];

function getKeyword(input: ResearchPostsInput): string {
  return input.keywords[0] ?? "campaign context";
}

function getToolMetadata(name: AgentToolName): AgentToolMetadata {
  const metadata = AGENT_TOOL_METADATA.find((tool) => tool.name === name);
  if (metadata === undefined) throw new Error(`Unknown agent tool: ${name}`);
  return metadata;
}

export const agentToolRegistry = {
  research_posts: {
    ...getToolMetadata("research_posts"),
    inputSchema: researchPostsInputSchema,
    outputSchema: researchPostsOutputSchema,
    execute: async (
      input: ResearchPostsInput,
      context: AgentToolExecutionContext,
    ) => {
      const discoveryItems = await insertDiscoveryItemsFromTool(input, context);
      return {
        candidates: Array.from(
          { length: Math.min(input.maxPosts, 3) },
          (_, index) => ({
            title: `Dry-run candidate ${index + 1}`,
            sourceSummary: `Local dry-run summary for ${getKeyword(input)}.`,
            suggestedAngle: `Turn ${getKeyword(input)} into a concrete operator lesson.`,
          }),
        ),
        discoveryItems,
        summary: `Prepared ${Math.min(input.maxPosts, 3)} local candidate summaries and saved ${discoveryItems.length} discovery suggestions.`,
      };
    },
  },
  score_relevance: {
    ...getToolMetadata("score_relevance"),
    inputSchema: scoreRelevanceInputSchema,
    outputSchema: scoreRelevanceOutputSchema,
    execute: async (
      input: ScoreRelevanceInput,
      context: AgentToolExecutionContext,
    ) => {
      const scores = await applyRelevanceScoresFromTool(input, context);
      return {
        scores,
        summary: `Applied ${scores.length} relevance scores locally.`,
      };
    },
  },
  draft_post: {
    ...getToolMetadata("draft_post"),
    inputSchema: draftPostInputSchema,
    outputSchema: draftPostOutputSchema,
    execute: async (input: DraftPostInput) => ({
      variants: input.variants,
      summary: `Accepted ${input.variants.length} provider-authored draft variants.`,
    }),
  },
  audit_post: {
    ...getToolMetadata("audit_post"),
    inputSchema: auditPostInputSchema,
    outputSchema: auditPostOutputSchema,
    execute: async (input: AuditPostInput) => ({
      findings: [
        {
          ruleKey: "contract_valid",
          severity: "pass" as const,
          message: `Audited ${input.text.length} characters through the dry-run contract.`,
        },
      ],
      summary: "Dry-run audit completed with no blocking findings.",
    }),
  },
  schedule_post: {
    ...getToolMetadata("schedule_post"),
    inputSchema: schedulePostInputSchema,
    outputSchema: schedulePostOutputSchema,
    execute: async (input: SchedulePostInput) => ({
      scheduled: false as const,
      approvalId: input.approvalId,
      scheduledFor: input.scheduledFor,
      timezone: input.timezone,
      summary:
        "Approval confirmed for schedule metadata only; no schedule record or publish action was created.",
    }),
  },
  collect_metrics: {
    ...getToolMetadata("collect_metrics"),
    inputSchema: collectMetricsInputSchema,
    outputSchema: collectMetricsOutputSchema,
    execute: async (input: CollectMetricsInput) => ({
      metricsAvailable: false as const,
      approvalId: input.approvalId,
      measuredAt: input.measuredAt,
      summary: "Dry-run metrics request recorded without external fetch.",
    }),
  },
} as AgentToolRegistry;

export type AnyAgentToolContract = AgentToolContract;
