import type { AgentRole, AgentToolName } from "@/agent/types";

export const AGENT_PLAYBOOK_KEYS = [
  "linkedin_writer",
  "linkedin_humanizer",
  "content_calendar",
  "linkedin_commenter",
  "campaign_analyst",
] as const;

export type AgentPlaybookKey = (typeof AGENT_PLAYBOOK_KEYS)[number];

export interface AgentPlaybookDefinition {
  key: AgentPlaybookKey;
  label: string;
  summary: string;
  compatibleRoles: AgentRole[];
  toolNames: AgentToolName[];
  roadmapSections: string[];
  runtimeEnabled: boolean;
  operatorGuidanceOnly: boolean;
  instructions: string[];
}

export const AGENT_PLAYBOOKS: Record<
  AgentPlaybookKey,
  AgentPlaybookDefinition
> = {
  linkedin_writer: {
    key: "linkedin_writer",
    label: "LinkedIn Writer",
    summary:
      "Drafts concrete LinkedIn post variants in the campaign voice for human review.",
    compatibleRoles: ["drafter"],
    toolNames: ["draft_post"],
    roadmapSections: ["6", "18"],
    runtimeEnabled: true,
    operatorGuidanceOnly: false,
    instructions: [
      "Use the LinkedIn Writer playbook: produce specific, useful post variants instead of generic thought leadership.",
      "Start with a clear hook, then one practical lesson, proof point, or operator detail from local context.",
      "Keep claims grounded in supplied campaign, candidate, memory, and metrics context; flag missing evidence instead of inventing it.",
      "Return draft_post inputs that preserve human approval before any publishing step.",
    ],
  },
  linkedin_humanizer: {
    key: "linkedin_humanizer",
    label: "LinkedIn Humanizer",
    summary:
      "Audits drafts for clarity, safety, specificity, and human approval readiness.",
    compatibleRoles: ["auditor"],
    toolNames: ["audit_post"],
    roadmapSections: ["7", "8", "18"],
    runtimeEnabled: true,
    operatorGuidanceOnly: false,
    instructions: [
      "Use the LinkedIn Humanizer playbook: make the draft sound specific, useful, and written by a real operator.",
      "Check for vague hype, unsupported claims, engagement bait, sensitive data, and external-link risk.",
      "Prefer actionable rewrite guidance over broad style advice.",
      "Return audit_post inputs only; approval must stay with the human operator.",
    ],
  },
  content_calendar: {
    key: "content_calendar",
    label: "Content Calendar",
    summary:
      "Plans approval-gated scheduling metadata around campaign cadence and readiness.",
    compatibleRoles: ["scheduler"],
    toolNames: ["schedule_post"],
    roadmapSections: ["9", "10", "18"],
    runtimeEnabled: true,
    operatorGuidanceOnly: false,
    instructions: [
      "Use the Content Calendar playbook: plan timing that respects campaign cadence and operator review.",
      "Prioritize ready approved content and explain scheduling rationale in plain language.",
      "Use local timezone context when available and ask for human confirmation when timing is ambiguous.",
      "Return schedule_post requests only as approval-gated scheduling metadata; never imply autonomous publishing.",
    ],
  },
  linkedin_commenter: {
    key: "linkedin_commenter",
    label: "LinkedIn Commenter",
    summary:
      "Guides human-led reply and comment workflows without autonomous commenting tools.",
    compatibleRoles: [],
    toolNames: [],
    roadmapSections: ["13", "18"],
    runtimeEnabled: false,
    operatorGuidanceOnly: true,
    instructions: [
      "Use the LinkedIn Commenter playbook only as operator guidance until typed comment tools and approval gates exist.",
      "Suggest concise, relevant replies that add context instead of performing engagement automation.",
      "Keep all commenting human-led; do not request browser automation, scraping, or autonomous posting.",
    ],
  },
  campaign_analyst: {
    key: "campaign_analyst",
    label: "Campaign Analyst",
    summary:
      "Collects local metrics and turns campaign performance into actionable learning.",
    compatibleRoles: ["analyst"],
    toolNames: ["collect_metrics"],
    roadmapSections: ["15", "18"],
    runtimeEnabled: true,
    operatorGuidanceOnly: false,
    instructions: [
      "Use the Campaign Analyst playbook: summarize what changed, what worked, and what to try next.",
      "Treat missing metrics as a data-quality note, not as permission to estimate performance.",
      "Connect metric observations to campaign memory so future drafts can improve.",
      "Return collect_metrics inputs only and keep analysis local-first.",
    ],
  },
};

const defaultPlaybookByRole: Partial<Record<AgentRole, AgentPlaybookKey>> = {
  drafter: "linkedin_writer",
  auditor: "linkedin_humanizer",
  scheduler: "content_calendar",
  analyst: "campaign_analyst",
};

export function getDefaultPlaybookForRole(
  role: AgentRole,
): AgentPlaybookKey | null {
  return defaultPlaybookByRole[role] ?? null;
}

export function getAgentPlaybook(
  key: string | null | undefined,
): AgentPlaybookDefinition | null {
  if (!key) return null;
  return AGENT_PLAYBOOK_KEYS.includes(key as AgentPlaybookKey)
    ? AGENT_PLAYBOOKS[key as AgentPlaybookKey]
    : null;
}

export function listAgentPlaybookDefinitions(): AgentPlaybookDefinition[] {
  return AGENT_PLAYBOOK_KEYS.map((key) => AGENT_PLAYBOOKS[key]);
}
