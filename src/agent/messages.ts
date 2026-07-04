import type { AgentPlaybookDefinition } from "@/agent/playbooks";
import type { AgentMessage, AgentRole } from "@/agent/types";
import type { WorkflowStepKey } from "@/workflows/types";

interface AgentPromptContext {
  campaignName?: string;
  workflowTitle?: string;
  workflowStepKey?: WorkflowStepKey;
  inputSummary: string;
  memorySummary?: string;
  metricsSummary?: string;
  playbook?: AgentPlaybookDefinition | null;
  customPlaybookInstructions?: string;
}

const roleInstructions: Record<AgentRole, string> = {
  researcher:
    "Base role: research relevant LinkedIn post opportunities using only Linkgo tools and local campaign context.",
  scorer:
    "Base role: score relevance conservatively, dedupe obvious repeats, and explain why a candidate is useful.",
  drafter:
    "Base role: draft concise LinkedIn post variants in the campaign voice without inventing unsupported claims.",
  auditor:
    "Base role: audit drafts for safety, clarity, quality, and approval readiness before any external action.",
  scheduler:
    "Base role: prepare scheduling metadata, then stop at human approval for any schedule_post request.",
  analyst:
    "Base role: collect metrics and summarize campaign learning into actionable local memory.",
};

const lockedSafetyInstructions = [
  "Use only the registered Linkgo tools.",
  "Keep LinkedIn publishing, commenting, and scheduling approval-gated.",
  "Never request shell, browser automation, file editing, repository scanning, or coding tools.",
] as const;

const stepGoal: Partial<Record<WorkflowStepKey, string>> = {
  research: "Find source material and candidate posts.",
  score: "Score and prioritize candidates.",
  draft: "Create draft variants.",
  audit: "Run quality and safety checks.",
  approve: "Wait for human review; do not continue autonomously.",
  schedule: "Request schedule_post approval only.",
  measure: "Record metrics and learning.",
};

export function getDefaultModelForRole(role: AgentRole): string {
  if (role === "researcher" || role === "drafter") return "gpt-4.1-mini";
  if (role === "auditor") return "gpt-4.1";
  return "gpt-4.1-mini";
}

export function buildAgentMessages(
  role: AgentRole,
  context: AgentPromptContext,
): AgentMessage[] {
  const systemLines = [
    "You are a Linkgo growth operations agent, not a coding agent.",
    roleInstructions[role],
  ];
  const playbook = context.playbook;
  const shouldUsePlaybook =
    playbook !== null &&
    playbook !== undefined &&
    playbook.runtimeEnabled &&
    !playbook.operatorGuidanceOnly &&
    playbook.compatibleRoles.includes(role);

  if (shouldUsePlaybook) {
    systemLines.push(
      `Selected playbook: ${playbook.label} (${playbook.key}).`,
      ...playbook.instructions,
    );
    const customInstructions = context.customPlaybookInstructions?.trim();
    if (customInstructions) {
      systemLines.push(
        "Operator custom playbook instructions:",
        customInstructions,
      );
    }
  }

  systemLines.push(...lockedSafetyInstructions);

  const userLines = [
    `Campaign: ${context.campaignName ?? "Current campaign"}`,
    `Workflow: ${context.workflowTitle ?? "Ad hoc agent run"}`,
    context.workflowStepKey
      ? `Step: ${context.workflowStepKey} — ${stepGoal[context.workflowStepKey] ?? "Complete the assigned step."}`
      : "Step: ad hoc runtime validation",
    `Input: ${context.inputSummary || "Use the available Linkgo context."}`,
  ];

  if (context.memorySummary) userLines.push(`Memory: ${context.memorySummary}`);
  if (context.metricsSummary)
    userLines.push(`Metrics: ${context.metricsSummary}`);

  return [
    { role: "system", content: systemLines.join("\n") },
    { role: "user", content: userLines.join("\n") },
  ];
}

export function roleForWorkflowStep(stepKey: WorkflowStepKey): AgentRole {
  const mapping: Record<WorkflowStepKey, AgentRole> = {
    research: "researcher",
    score: "scorer",
    draft: "drafter",
    audit: "auditor",
    approve: "auditor",
    schedule: "scheduler",
    measure: "analyst",
  };
  return mapping[stepKey];
}
