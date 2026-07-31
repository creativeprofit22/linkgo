import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { z } from "zod";

import { scoreRelevanceInputSchema } from "../src/agent/schemas";

function frontendScoreRelevanceProviderSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(scoreRelevanceInputSchema, {
    target: "draft-7",
    io: "input",
  }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

test("native score_relevance allowlist matches the generated frontend contract", () => {
  const nativeSchema = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "src-tauri/schemas/score_relevance.input.schema.json",
      ),
      "utf8",
    ),
  ) as unknown;

  expect(nativeSchema).toEqual(frontendScoreRelevanceProviderSchema());
});

test("score_relevance keeps exact candidate-to-score validation in TypeScript", () => {
  const baseInput = {
    campaignId: 7,
    candidatePostIds: [11, 12],
    scores: [
      { candidatePostId: 11, score: 84, rationale: "Strong campaign fit." },
      { candidatePostId: 12, score: 63, rationale: "Useful adjacent topic." },
    ],
  };

  expect(scoreRelevanceInputSchema.parse(baseInput)).toMatchObject({
    minimumScore: 60,
    autoRejectBelowMinimum: false,
  });
  expect(
    scoreRelevanceInputSchema.safeParse({
      ...baseInput,
      candidatePostIds: [11, 11],
    }).success,
  ).toBe(false);
  expect(
    scoreRelevanceInputSchema.safeParse({
      ...baseInput,
      scores: [baseInput.scores[0]],
    }).success,
  ).toBe(false);
  expect(
    scoreRelevanceInputSchema.safeParse({
      ...baseInput,
      scores: [
        ...baseInput.scores,
        { candidatePostId: 99, score: 50, rationale: "Foreign candidate." },
      ],
    }).success,
  ).toBe(false);
});
