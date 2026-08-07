import { expect, test } from "@playwright/test";

import {
  AUDIT_POST_FINDING_KEYS,
  AUDIT_POST_TEXT_MAX_LENGTH,
  auditPostInputSchema,
} from "../src/agent/schemas";

const findings = AUDIT_POST_FINDING_KEYS.map((ruleKey) => ({
  ruleKey,
  severity: "pass" as const,
  message: `Provider-authored ${ruleKey} finding.`,
}));

function auditInput(text: string) {
  return {
    campaignId: 1,
    draftVariantId: 2,
    contentRevision: 3,
    auditRunId: 4,
    text,
    findings,
  };
}

test("audit_post preserves exact full-length draft text without normalization", () => {
  const text = ` ${"x".repeat(AUDIT_POST_TEXT_MAX_LENGTH - 2)} `;
  const parsed = auditPostInputSchema.parse(auditInput(text));

  expect(parsed.text).toBe(text);
  expect(parsed.text).toHaveLength(AUDIT_POST_TEXT_MAX_LENGTH);
});

test("audit_post rejects blank text and text beyond the canonical draft maximum", () => {
  expect(auditPostInputSchema.safeParse(auditInput(" \n\t ")).success).toBe(
    false,
  );
  expect(
    auditPostInputSchema.safeParse(
      auditInput("x".repeat(AUDIT_POST_TEXT_MAX_LENGTH + 1)),
    ).success,
  ).toBe(false);
});
