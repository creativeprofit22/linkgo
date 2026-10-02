import { expect, test } from "@playwright/test";

import {
  AUDIT_POST_FINDING_KEYS,
  AUDIT_POST_TEXT_MAX_LENGTH,
  auditPostInputSchema,
} from "../src/agent/schemas";
// AGENT_TOOL_METADATA (src/agent/tools.ts) pulls in browser-only runtime code, so
// use the Node-safe name list it is typed against: metadata names must be
// AgentToolName values, and tools.ts's complete registry looks up metadata for
// every AgentToolName at load, so the two lists cannot silently diverge.
import { AGENT_TOOL_NAMES } from "../src/agent/types";
import {
  ASSISTANT_ACTION_LABELS,
  getAssistantActionLabel,
} from "../src/lib/assistant-action-labels";

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

test("every agent tool has a user-facing assistant action label", () => {
  const toolNames: readonly string[] = AGENT_TOOL_NAMES;
  const unlabeled = toolNames.filter(
    (name) =>
      !Object.prototype.hasOwnProperty.call(ASSISTANT_ACTION_LABELS, name),
  );

  expect(unlabeled).toEqual([]);
  for (const name of toolNames) {
    const label = getAssistantActionLabel(name);
    expect(label.trim()).not.toBe("");
    expect(label).not.toBe(name);
  }
});

test("unknown assistant actions fall back to the raw tool name", () => {
  expect(getAssistantActionLabel("future_tool")).toBe("future_tool");
  expect(getAssistantActionLabel("constructor")).toBe("constructor");
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
