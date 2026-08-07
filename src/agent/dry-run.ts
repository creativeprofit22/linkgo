import { AUDIT_POST_FINDING_KEYS } from "@/agent/schemas";
import {
  DRAFT_CONTENT_INTENTS,
  type DraftContentIntent,
} from "@/features/drafts/types";
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

function getDraftRequestDetails(request: AgentModelRequest): {
  draftGenerationRequestId: number;
  candidatePostId: number;
  variantCount: number;
  contentIntent: DraftContentIntent;
  angle: string;
  voiceNotes: string;
} {
  const draftRequest = request.inputContext?.draftRequest;
  const requestMetadata =
    typeof draftRequest === "object" && draftRequest !== null
      ? (draftRequest as Record<string, unknown>)
      : {};
  const draftGenerationRequestId = Number(
    requestMetadata.draftGenerationRequestId ?? request.runId,
  );
  const candidatePostId = Number(requestMetadata.candidatePostId ?? 1);
  const variantCount = Number(requestMetadata.variantCount ?? 3);
  const requestedIntent = requestMetadata.contentIntent;
  const contentIntent = DRAFT_CONTENT_INTENTS.includes(
    requestedIntent as DraftContentIntent,
  )
    ? (requestedIntent as DraftContentIntent)
    : "idea";
  const angle =
    /^Operator angle: (?<angle>.+)$/imu.exec(request.inputSummary)?.groups
      ?.angle ?? "Dry-run operator lesson";
  const voiceNotes =
    /^Operator voice notes: (?<voice>.+)$/imu.exec(request.inputSummary)?.groups
      ?.voice ?? "Use the campaign voice.";

  return {
    draftGenerationRequestId:
      Number.isInteger(draftGenerationRequestId) && draftGenerationRequestId > 0
        ? draftGenerationRequestId
        : request.runId,
    candidatePostId:
      Number.isInteger(candidatePostId) && candidatePostId > 0
        ? candidatePostId
        : 1,
    variantCount:
      Number.isInteger(variantCount) && variantCount >= 3 && variantCount <= 5
        ? variantCount
        : 3,
    contentIntent,
    angle,
    voiceNotes,
  };
}

function getAuditRequestDetails(request: AgentModelRequest) {
  const auditRequest = request.inputContext?.auditRequest;
  const hasDurableAuditRequest =
    typeof auditRequest === "object" && auditRequest !== null;
  const metadata = hasDurableAuditRequest
    ? (auditRequest as Record<string, unknown>)
    : {};
  const positiveInteger = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  const requestedText = typeof metadata.text === "string" ? metadata.text : "";

  return {
    draftVariantId: positiveInteger(metadata.draftVariantId, 1),
    contentRevision: positiveInteger(metadata.contentRevision, 1),
    auditRunId: positiveInteger(metadata.auditRunId, request.runId),
    text: hasDurableAuditRequest
      ? requestedText
      : "Dry-run audit text with concrete operator detail.",
  };
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
    const draftDetails = getDraftRequestDetails(request);
    return {
      providerToolCallId: `dry-run-${request.runId}-tool-call-2`,
      toolName: "draft_post",
      input: {
        draftGenerationRequestId: draftDetails.draftGenerationRequestId,
        campaignId: request.campaignId,
        candidatePostId: draftDetails.candidatePostId,
        variantCount: draftDetails.variantCount,
        contentIntent: draftDetails.contentIntent,
        angle: draftDetails.angle,
        voiceNotes: draftDetails.voiceNotes,
        variants: Array.from(
          { length: draftDetails.variantCount },
          (_, index) => ({
            hook: `Dry-run provider hook ${index + 1}: ${draftDetails.contentIntent} insight`,
            body: `Dry-run provider body ${index + 1} turns candidate ${draftDetails.candidatePostId} into a distinct operator lesson.`,
            cta: `Review dry-run provider variant ${index + 1}.`,
            hashtags: ["#LinkedIn", `#Variant${index + 1}`],
          }),
        ),
      },
    };
  }
  if (request.agentRole === "auditor") {
    const auditDetails = getAuditRequestDetails(request);
    const findingMessages: Record<
      (typeof AUDIT_POST_FINDING_KEYS)[number],
      string
    > = {
      hook: "The dry-run hook is concrete but could create stronger tension.",
      specificity: "The draft includes a concrete operator detail.",
      generic_language: "The draft avoids generic motivational language.",
      authenticity:
        "No unsupported personal experience is stated in the supplied text.",
      clarity: "The supplied sentence is direct and easy to parse.",
      safety:
        "The supplied text contains no external action or publishing request.",
    };
    return {
      providerToolCallId: `dry-run-${request.runId}-tool-call-2`,
      toolName: "audit_post",
      input: {
        campaignId: request.campaignId,
        draftVariantId: auditDetails.draftVariantId,
        contentRevision: auditDetails.contentRevision,
        auditRunId: auditDetails.auditRunId,
        text: auditDetails.text,
        findings: AUDIT_POST_FINDING_KEYS.map((ruleKey) => ({
          ruleKey,
          severity: ruleKey === "hook" ? "warning" : "pass",
          message: findingMessages[ruleKey],
        })),
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
      const hasToolResult = request.messages.some(
        (message) => message.role === "tool",
      );
      if (hasToolResult) {
        yield {
          type: "done",
          outputSummary: `Dry-run ${request.agentRole}${playbookSummary} completed local contract validation.`,
        };
        return;
      }

      yield {
        type: "text",
        text: `Dry-run ${request.agentRole}${playbookSummary} is validating local runtime contracts.`,
      };
      yield { type: "tool_call", ...buildToolCall(request) };
      yield {
        type: "done",
        outputSummary: `Dry-run ${request.agentRole}${playbookSummary} requested local tool execution.`,
      };
    },
  };
}
