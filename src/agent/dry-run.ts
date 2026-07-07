import type {
  AgentModelChunk,
  AgentModelRequest,
  AgentProvider,
  AgentToolName,
} from "@/agent/types";

function getWorkflowRunId(request: AgentModelRequest): number | undefined {
  return request.workflowRunId ?? undefined;
}

function getCandidatePostIds(request: AgentModelRequest): number[] {
  const candidateIdsPattern = /candidate ids?:\s*([\d,\s]+)/iu;
  const idList = candidateIdsPattern.exec(request.inputSummary)?.[1];
  if (idList === undefined || idList.trim().length === 0) return [];
  const ids = idList
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  return ids.length > 0 ? ids.slice(0, 50) : [1];
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
        candidatePostIds: getCandidatePostIds(request),
        minimumScore: 60,
        scores: getCandidatePostIds(request).map((candidatePostId, index) => ({
          candidatePostId,
          score: index === 0 ? 78 : 54,
          rationale:
            index === 0
              ? "Dry-run score: strong campaign fit with a clear operator lesson."
              : "Dry-run score: useful but less directly tied to the campaign promise.",
        })),
        autoRejectBelowMinimum: /auto[-\s]?reject:\s*true/iu.test(
          request.inputSummary,
        ),
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
      suggestions: [
        {
          kind: "keyword",
          title: "Founder-led LinkedIn content",
          keyword: "founder-led content",
          rationale:
            "Dry-run suggestion based on campaign positioning and queue seed keywords.",
          sourceKeyword: "LinkedIn growth",
          confidenceScore: 84,
        },
        {
          kind: "trend",
          title: "Operator-led AI workflow proof",
          keyword: "AI workflow proof",
          rationale:
            "Dry-run trend for posts that show concrete workflow outcomes without scraping LinkedIn.",
          sourceKeyword: "founder content",
          confidenceScore: 76,
        },
        {
          kind: "source_prompt",
          title: "Ask customers about manual review bottlenecks",
          keyword: "manual review bottlenecks",
          rationale:
            "Dry-run source prompt for finding compliant first-party research angles.",
          sourceKeyword: "LinkedIn growth",
          confidenceScore: 68,
        },
      ],
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
