import type {
  AgentModelChunk,
  AgentModelRequest,
  AgentProvider,
  AgentToolName,
} from "@/agent/types";

function getWorkflowRunId(request: AgentModelRequest): number | undefined {
  return request.workflowRunId ?? undefined;
}

function buildToolCall(request: AgentModelRequest): {
  providerToolCallId: string;
  toolName: AgentToolName;
  input: unknown;
} {
  if (request.agentRole === "scorer") {
    return {
      providerToolCallId: `dry-run-${request.runId}-tool-call-2`,
      toolName: "score_relevance",
      input: {
        campaignId: request.campaignId,
        candidatePostIds: [1],
        minimumScore: 60,
      },
    };
  }

  if (request.agentRole === "drafter") {
    return {
      providerToolCallId: `dry-run-${request.runId}-tool-call-2`,
      toolName: "draft_post",
      input: {
        campaignId: request.campaignId,
        candidatePostId: 1,
        variantCount: 3,
        angle: "Dry-run operator lesson",
        voiceNotes: request.inputSummary,
      },
    };
  }

  if (request.agentRole === "auditor") {
    return {
      providerToolCallId: `dry-run-${request.runId}-tool-call-2`,
      toolName: "audit_post",
      input: {
        campaignId: request.campaignId,
        text: "Dry-run audit text with concrete operator detail.",
        rules: ["hook", "specificity", "external_link"],
      },
    };
  }

  if (request.agentRole === "scheduler") {
    return {
      providerToolCallId: `dry-run-${request.runId}-tool-call-2`,
      toolName: "schedule_post",
      input: {
        campaignId: request.campaignId,
        approvalId: 1,
        scheduledFor: "next business day 09:00",
        timezone: "local",
      },
    };
  }

  if (request.agentRole === "analyst") {
    return {
      providerToolCallId: `dry-run-${request.runId}-tool-call-2`,
      toolName: "collect_metrics",
      input: {
        campaignId: request.campaignId,
        approvalId: 1,
        measuredAt: "dry-run-now",
      },
    };
  }

  return {
    providerToolCallId: `dry-run-${request.runId}-tool-call-2`,
    toolName: "research_posts",
    input: {
      campaignId: request.campaignId,
      workflowRunId: getWorkflowRunId(request),
      keywords: ["LinkedIn growth", "founder content"],
      maxPosts: 3,
      notes: request.inputSummary,
    },
  };
}

export function createDryRunProvider(
  modelName = "dry-run-local",
): AgentProvider {
  return {
    key: "dry_run",
    modelName,
    stream: async function* dryRunStream(
      request: AgentModelRequest,
    ): AsyncIterable<AgentModelChunk> {
      const playbookSummary = request.playbookKey
        ? ` with playbook ${request.playbookLabel ?? request.playbookKey} (${request.playbookKey})`
        : " with no playbook";
      yield {
        type: "text",
        text: `Dry-run ${request.agentRole}${playbookSummary} is validating local runtime contracts.`,
      };
      yield { type: "tool_call", ...buildToolCall(request) };
      yield {
        type: "done",
        outputSummary: `Dry-run ${request.agentRole}${playbookSummary} completed local contract validation.`,
      };
    },
  };
}
