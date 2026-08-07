import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { z } from "zod";

import {
  AUDIT_POST_FINDING_KEYS,
  auditPostInputSchema,
  scoreRelevanceInputSchema,
} from "../src/agent/schemas";

function frontendProviderSchema(schema: z.ZodType): Record<string, unknown> {
  const providerSchema = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
  }) as Record<string, unknown>;
  delete providerSchema.$schema;
  return providerSchema;
}

function readNativeSchema(fileName: string): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "src-tauri/schemas", fileName), "utf8"),
  ) as unknown;
}

test("native score_relevance allowlist matches the generated frontend contract", () => {
  expect(readNativeSchema("score_relevance.input.schema.json")).toEqual(
    frontendProviderSchema(scoreRelevanceInputSchema),
  );
});

test("native audit_post allowlist matches the generated frontend contract", () => {
  expect(readNativeSchema("audit_post.input.schema.json")).toEqual(
    frontendProviderSchema(auditPostInputSchema),
  );
});

const auditFindings = AUDIT_POST_FINDING_KEYS.map((ruleKey) => ({
  ruleKey,
  severity: ruleKey === "safety" ? ("warning" as const) : ("pass" as const),
  message: `Provider-authored ${ruleKey} finding.`,
}));

const auditInput = {
  campaignId: 7,
  draftVariantId: 11,
  contentRevision: 3,
  auditRunId: 19,
  text: "A supplied draft revision with a concrete claim.",
  findings: auditFindings,
};

test("audit_post requires exact identities and one bounded finding per category", () => {
  expect(auditPostInputSchema.parse(auditInput)).toEqual(auditInput);
  expect(
    auditPostInputSchema.safeParse({
      ...auditInput,
      findings: auditFindings.map((finding) => ({
        ...finding,
        ruleKey: "hook",
      })),
    }).success,
  ).toBe(false);
  expect(
    auditPostInputSchema.safeParse({
      ...auditInput,
      findings: auditFindings.map((finding) => ({
        ...finding,
        message: "x".repeat(501),
      })),
    }).success,
  ).toBe(false);
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
