/// <reference types="node" />
import { expect, test } from "@playwright/test";
import { createDryRunProvider } from "../src/agent/dry-run";
import type { AgentModelRequest } from "../src/agent/types";
import { toDraftQualitySettlement } from "../src/features/drafts/quality-settlement";
import { applyDraftQualityScoreInputSchema } from "../src/features/drafts/schemas";
import { readFileSync } from "node:fs";
const settlement = JSON.parse(
  readFileSync(
    new URL("./fixtures/draft-quality-settlement.json", import.meta.url),
    "utf8",
  ),
);

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

test("quality mapper serializes the native settlement fixture", () => {
  // This is the provider-facing shape used by the quality orchestrator.
  const provider = {
    campaignId: 1,
    draftVariantId: 1,
    qualityRunId: 1,
    attemptId: 1,
    contentRevision: 1,
    hook: "A concrete hook",
    body: "A specific example.",
    cta: "Review it.",
    hashtags: "#Quality",
    threshold: 70 as const,
    rewriteAllowed: true,
    priorCategoryFeedback: [],
    categoryScores: settlement.categoryScores,
  };
  expect(
    JSON.parse(JSON.stringify(toDraftQualitySettlement(provider, 1))),
  ).toEqual(settlement);
  expect(
    applyDraftQualityScoreInputSchema.safeParse({ ...provider, agentRunId: 1 })
      .success,
  ).toBe(false);
});

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
  const initialSettlement = toDraftQualitySettlement(initial, 1);
  expect(initialSettlement.rewrite).toEqual(initial.rewrite);
  expect(initialSettlement.summary).toContain("overall quality 62/100");
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
      priorCategoryFeedback: initialSettlement.categoryScores.map(
        ({ categoryKey, feedback }) => ({ categoryKey, feedback }),
      ),
    }),
  );

  expect(reaudited.categoryScores).toEqual(
    expect.arrayContaining([expect.objectContaining({ score: 78 })]),
  );
  expect(reaudited).not.toHaveProperty("rewrite");
  expect(toDraftQualitySettlement(reaudited, 1)).not.toHaveProperty("rewrite");
  expect(toDraftQualitySettlement(reaudited, 1).summary).toContain(
    "overall quality 78/100",
  );
});
