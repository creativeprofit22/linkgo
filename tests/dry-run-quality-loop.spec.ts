import { expect, test } from "@playwright/test";
import { createDryRunProvider } from "../src/agent/dry-run";
import type { AgentModelRequest } from "../src/agent/types";

async function qualityToolInput(
  request: AgentModelRequest,
): Promise<Record<string, unknown>> {
  const chunks = [];
  for await (const chunk of createDryRunProvider().stream(request)) {
    chunks.push(chunk);
  }
  const call = chunks.find((chunk) => chunk.type === "tool_call");
  expect(call?.type).toBe("tool_call");
  return (call as { input: Record<string, unknown> }).input;
}

function qualityRequest(
  qualityRequest: Record<string, unknown>,
): AgentModelRequest {
  return {
    runId: 1,
    campaignId: 2,
    workflowRunId: null,
    workflowStepId: null,
    agentRole: "auditor",
    inputSummary: "Score attended draft quality",
    inputContext: { qualityRequest },
    messages: [],
  };
}

test("dry-run quality provider exercises rewrite then passing re-score", async () => {
  const initial = await qualityToolInput(
    qualityRequest({
      draftVariantId: 3,
      qualityRunId: 4,
      attemptId: 5,
      contentRevision: 1,
      hook: "A practical quality lesson",
      body: "The first draft needs more concrete detail.",
      cta: "Review it.",
      hashtags: "#Quality",
      rewriteAllowed: true,
      priorCategoryFeedback: [],
    }),
  );

  expect(initial.categoryScores).toEqual(
    expect.arrayContaining([expect.objectContaining({ score: 62 })]),
  );
  expect(initial.rewrite).toEqual(
    expect.objectContaining({
      hook: "Rewritten: A practical quality lesson",
    }),
  );

  const rewritten = initial.rewrite as Record<string, unknown>;
  const reaudited = await qualityToolInput(
    qualityRequest({
      draftVariantId: 3,
      qualityRunId: 4,
      attemptId: 6,
      contentRevision: 2,
      hook: rewritten.hook,
      body: rewritten.body,
      cta: rewritten.cta,
      hashtags: rewritten.hashtags,
      rewriteAllowed: true,
      priorCategoryFeedback: initial.categoryScores,
    }),
  );

  expect(reaudited.categoryScores).toEqual(
    expect.arrayContaining([expect.objectContaining({ score: 78 })]),
  );
  expect(reaudited).not.toHaveProperty("rewrite");
});
