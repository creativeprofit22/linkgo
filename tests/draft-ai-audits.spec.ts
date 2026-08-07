import { expect, test, type Page } from "@playwright/test";
import type { DraftVariantWithAudits } from "../src/features/drafts/types";
import { setupTauriMocks } from "./helpers/tauri-mocks";

type DraftAuditTestApi = Pick<
  typeof import("../src/features/drafts/data"),
  | "completeDraftAiAuditRun"
  | "failDraftAiAuditRun"
  | "listDrafts"
  | "reconcileDraftAiAuditLifecycle"
  | "runDraftAiAudit"
  | "startDraftAiAuditRun"
  | "updateDraftVariant"
>;

const RULE_KEYS = [
  "hook",
  "specificity",
  "generic_language",
  "authenticity",
  "clarity",
  "safety",
] as const;

const findings = RULE_KEYS.map((ruleKey) => ({
  ruleKey,
  severity: ruleKey === "safety" ? ("warning" as const) : ("pass" as const),
  message: `Provider-authored ${ruleKey} finding.`,
}));

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      "__LINKGO_DRAFTS_TEST_API__" in
      (window as unknown as Record<string, unknown>),
  );
});

async function seedVariant(page: Page): Promise<{
  id: number;
  contentRevision: number;
}> {
  return page.evaluate(() => {
    const seed = (
      window as unknown as {
        __LINKGO_SQL_SEED_DRAFT_AI_AUDIT_VARIANT__: () => {
          id: number;
          content_revision: number;
        };
      }
    ).__LINKGO_SQL_SEED_DRAFT_AI_AUDIT_VARIANT__;
    const variant = seed();
    return { id: variant.id, contentRevision: variant.content_revision };
  });
}

async function seedUnrelatedCampaign(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke: (command: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    if (internals === undefined) throw new Error("Tauri mocks unavailable");
    const result = (await internals.invoke("plugin:sql|execute", {
      query: `INSERT INTO campaigns (
        name, product, audience, voice, tone, auto_pilot,
        daily_post_limit, daily_comment_limit, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
      values: [
        "Unrelated campaign",
        "Other product",
        "Other audience",
        "Direct",
        "Neutral",
        0,
        1,
        5,
      ],
    })) as { lastInsertId: number };
    return result.lastInsertId;
  });
}

async function getAuditState(page: Page) {
  return page.evaluate(() => {
    const mockWindow = window as unknown as {
      __LINKGO_SQL_DRAFT_AI_AUDIT_RUNS__: () => Array<Record<string, unknown>>;
      __LINKGO_SQL_DRAFT_AI_AUDIT_FINDINGS__: () => Array<
        Record<string, unknown>
      >;
      __LINKGO_SQL_AGENT_RUNS__: () => Array<Record<string, unknown>>;
      __LINKGO_SQL_AGENT_TOOL_CALLS__: () => Array<Record<string, unknown>>;
      __LINKGO_SQL_AGENT_RUN_EVENTS__: () => Array<Record<string, unknown>>;
      __LINKGO_SQL_AGENT_APPROVAL_CHECKPOINTS__: () => Array<
        Record<string, unknown>
      >;
      __LINKGO_SQL_CANDIDATE_POSTS__: () => Array<Record<string, unknown>>;
      __LINKGO_SQL_CANDIDATE_DISCOVERY_ITEMS__: () => Array<
        Record<string, unknown>
      >;
    };
    return {
      runs: mockWindow.__LINKGO_SQL_DRAFT_AI_AUDIT_RUNS__(),
      findings: mockWindow.__LINKGO_SQL_DRAFT_AI_AUDIT_FINDINGS__(),
      agents: mockWindow.__LINKGO_SQL_AGENT_RUNS__(),
      toolCalls: mockWindow.__LINKGO_SQL_AGENT_TOOL_CALLS__(),
      events: mockWindow.__LINKGO_SQL_AGENT_RUN_EVENTS__(),
      checkpoints: mockWindow.__LINKGO_SQL_AGENT_APPROVAL_CHECKPOINTS__(),
      candidates: mockWindow.__LINKGO_SQL_CANDIDATE_POSTS__(),
      discoveryItems: mockWindow.__LINKGO_SQL_CANDIDATE_DISCOVERY_ITEMS__(),
    };
  });
}

async function replaceStoredVariantAuditText(
  page: Page,
  draftVariantId: number,
  segments: [hook: string, body: string, cta: string, hashtags: string],
): Promise<void> {
  await page.evaluate(
    async ({ draftVariantId, segments }) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (command: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (internals === undefined) throw new Error("Tauri mocks unavailable");
      await internals.invoke("plugin:sql|execute", {
        query: `UPDATE draft_variants
          SET hook = $1, body = $2, cta = $3, hashtags = $4
          WHERE id = $5`,
        values: [...segments, draftVariantId],
      });
    },
    { draftVariantId, segments },
  );
}

test("runs a linked dry-run audit with byte-identical revision context and six findings", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const auditRunId = await page.evaluate(async (draftVariantId) => {
    const data = (
      window as unknown as { __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi }
    ).__LINKGO_DRAFTS_TEST_API__;
    return data.runDraftAiAudit({ draftVariantId });
  }, variant.id);

  const state = await getAuditState(page);
  expect(state.runs).toHaveLength(1);
  expect(state.runs[0]).toMatchObject({
    id: auditRunId,
    draft_variant_id: variant.id,
    content_revision: variant.contentRevision,
    status: "completed",
    agent_run_id: expect.any(Number),
  });
  expect(state.agents).toHaveLength(1);
  expect(state.agents[0]).toMatchObject({
    agent_role: "auditor",
    playbook_key: "linkedin_humanizer",
    provider_key: "dry_run",
    status: "completed",
  });

  const canonicalText =
    "Exact revision hook\n\nExact revision body with a concrete operator detail.\n\nReview the exact revision.\n\n#Linkgo";
  const inputContext = JSON.parse(
    String(state.agents[0]?.input_context_json ?? "{}"),
  ) as { auditRequest?: Record<string, unknown> };
  expect(inputContext.auditRequest).toEqual({
    campaignId: 1,
    draftVariantId: variant.id,
    contentRevision: variant.contentRevision,
    auditRunId,
    text: canonicalText,
  });

  expect(state.toolCalls).toHaveLength(1);
  const toolInput = JSON.parse(
    String(state.toolCalls[0]?.input_json ?? "{}"),
  ) as { text: string; contentRevision: number };
  expect(toolInput.text).toBe(canonicalText);
  expect(toolInput.contentRevision).toBe(variant.contentRevision);
  expect(state.findings).toHaveLength(6);
  expect(state.findings.map((finding) => finding.rule_key)).toEqual(RULE_KEYS);
});

for (const invalidVariant of [
  {
    label: "empty",
    segments: ["", "", "", ""] as [string, string, string, string],
  },
  {
    label: "whitespace-only",
    segments: [" ", "\n", "\t", " \r\n"] as [string, string, string, string],
  },
]) {
  test(`rejects ${invalidVariant.label} stored variants before creating durable audit state`, async ({
    page,
  }) => {
    const variant = await seedVariant(page);
    await replaceStoredVariantAuditText(
      page,
      variant.id,
      invalidVariant.segments,
    );

    const errorMessage = await page.evaluate(async (draftVariantId) => {
      const data = (
        window as unknown as { __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi }
      ).__LINKGO_DRAFTS_TEST_API__;
      try {
        await data.runDraftAiAudit({ draftVariantId });
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, variant.id);

    expect(errorMessage).toBe(
      "Draft AI audit text must contain at least one non-whitespace character",
    );
    const state = await getAuditState(page);
    expect(state.runs).toHaveLength(0);
    expect(state.agents).toHaveLength(0);
    expect(state.toolCalls).toHaveLength(0);
    expect(state.findings).toHaveLength(0);
  });
}

test("rejects research_posts from an auditor before any candidate mutation", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const unrelatedCampaignId = await seedUnrelatedCampaign(page);
  const before = await getAuditState(page);

  const errorMessage = await page.evaluate(
    async ({ draftVariantId, unrelatedCampaignId, findings }) => {
      const testWindow = window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
        __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
        __AUDITOR_PROVIDER_ARGS__?: unknown;
        __TAURI_INTERNALS__?: {
          invoke: (command: string, args?: unknown) => Promise<unknown>;
        };
      };
      testWindow.__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
        execute: (args: unknown) => {
          testWindow.__AUDITOR_PROVIDER_ARGS__ = args;
          const request = (
            args as {
              input: {
                request: {
                  inputContext?: { auditRequest?: Record<string, unknown> };
                };
              };
            }
          ).input.request;
          const auditRequest = request.inputContext?.auditRequest;
          if (auditRequest === undefined) {
            throw new Error("Audit request context unavailable");
          }
          return {
            chunks: [
              {
                type: "tool_call",
                providerToolCallId: "auditor-cross-campaign-research",
                toolName: "research_posts",
                input: {
                  campaignId: unrelatedCampaignId,
                  keywords: ["injected keyword"],
                  maxPosts: 1,
                  suggestions: [
                    {
                      kind: "keyword",
                      title: "Injected discovery",
                      keyword: "injected keyword",
                      rationale: "This must never be persisted by an auditor.",
                      sourceKeyword: "prompt injection",
                      confidenceScore: 99,
                    },
                  ],
                },
              },
              {
                type: "tool_call",
                providerToolCallId: "auditor-valid-audit",
                toolName: "audit_post",
                input: { ...auditRequest, findings },
              },
              {
                type: "done",
                outputSummary: "Attempted an out-of-scope auditor tool call.",
              },
            ],
          };
        },
      };
      await testWindow.__TAURI_INTERNALS__?.invoke("linkgo_auth_api_key", {
        input: { providerKey: "anthropic", apiKey: "test-auditor-key" },
      });
      try {
        await testWindow.__LINKGO_DRAFTS_TEST_API__.runDraftAiAudit({
          draftVariantId,
          providerKey: "anthropic",
        });
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    { draftVariantId: variant.id, unrelatedCampaignId, findings },
  );

  const expectedError =
    "Provider turn rejected before tool execution: tool call research_posts was not offered for this run.";
  expect(errorMessage).toBe(expectedError);
  const state = await getAuditState(page);
  expect(state.runs[0]).toMatchObject({
    status: "failed",
    error_message: expectedError,
  });
  expect(state.agents[0]).toMatchObject({
    agent_role: "auditor",
    status: "failed",
    error_message: expectedError,
  });
  expect(state.toolCalls).toHaveLength(0);
  expect(state.candidates).toEqual(before.candidates);
  expect(state.discoveryItems).toEqual(before.discoveryItems);
  expect(state.findings).toHaveLength(0);

  const providerArgs = await page.evaluate(
    () =>
      (window as unknown as { __AUDITOR_PROVIDER_ARGS__?: unknown })
        .__AUDITOR_PROVIDER_ARGS__,
  );
  expect(providerArgs).toMatchObject({
    input: {
      tools: [expect.objectContaining({ name: "audit_post" })],
    },
  });
});

test("copies a provider failure onto the linked audit without findings", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const errorMessage = await page.evaluate(async (draftVariantId) => {
    const testWindow = window as unknown as {
      __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
        execute: () => never;
      };
      __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
      __TAURI_INTERNALS__?: {
        invoke: (command: string, args?: unknown) => Promise<unknown>;
      };
    };
    testWindow.__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute: () => {
        throw new Error("Injected audit provider outage");
      },
    };
    await testWindow.__TAURI_INTERNALS__?.invoke("linkgo_auth_api_key", {
      input: { providerKey: "anthropic", apiKey: "test-anthropic-key" },
    });
    try {
      await testWindow.__LINKGO_DRAFTS_TEST_API__.runDraftAiAudit({
        draftVariantId,
        providerKey: "anthropic",
      });
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, variant.id);

  expect(errorMessage).toContain("Injected audit provider outage");
  const state = await getAuditState(page);
  expect(state.runs[0]).toMatchObject({
    status: "failed",
    agent_run_id: expect.any(Number),
  });
  expect(state.runs[0]?.error_message).toContain(
    "Injected audit provider outage",
  );
  expect(state.agents[0]).toMatchObject({
    status: "failed",
    provider_key: "anthropic",
  });
  expect(state.agents[0]?.error_message).toBe(state.runs[0]?.error_message);
  expect(state.events.length).toBeGreaterThan(0);
  expect(state.findings).toHaveLength(0);
});

test("rejects a completed audit_post with altered identity and preserves evidence", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const canonicalText =
    "Exact revision hook\n\nExact revision body with a concrete operator detail.\n\nReview the exact revision.\n\n#Linkgo";
  const errorMessage = await page.evaluate(
    async ({ draftVariantId, contentRevision, canonicalText, findings }) => {
      const testWindow = window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
        __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
        __TAURI_INTERNALS__?: {
          invoke: (command: string, args?: unknown) => Promise<unknown>;
        };
      };
      testWindow.__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
        execute: (args: unknown) => {
          const messages = (
            args as {
              input: { request: { messages: Array<{ role: string }> } };
            }
          ).input.request.messages;
          if (messages.some((message) => message.role === "tool")) {
            return {
              chunks: [
                {
                  type: "done",
                  outputSummary: "Provider audit tool call completed.",
                },
              ],
            };
          }
          return {
            chunks: [
              {
                type: "tool_call",
                providerToolCallId: "altered-audit-identity",
                toolName: "audit_post",
                input: {
                  campaignId: 1,
                  draftVariantId,
                  contentRevision,
                  auditRunId: 1,
                  text: `${canonicalText}!`,
                  findings,
                },
              },
              {
                type: "done",
                outputSummary: "Provider requested audit persistence.",
              },
            ],
          };
        },
      };
      await testWindow.__TAURI_INTERNALS__?.invoke("linkgo_auth_api_key", {
        input: { providerKey: "anthropic", apiKey: "test-anthropic-key" },
      });
      try {
        await testWindow.__LINKGO_DRAFTS_TEST_API__.runDraftAiAudit({
          draftVariantId,
          providerKey: "anthropic",
        });
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    {
      draftVariantId: variant.id,
      contentRevision: variant.contentRevision,
      canonicalText,
      findings,
    },
  );

  expect(errorMessage).toBe(
    "Auditor tool input did not match the durable audit request",
  );
  const state = await getAuditState(page);
  expect(state.runs[0]).toMatchObject({
    status: "failed",
    error_message: errorMessage,
  });
  expect(state.agents[0]?.status).toBe("completed");
  expect(state.toolCalls[0]).toMatchObject({
    tool_name: "audit_post",
    status: "completed",
  });
  expect(state.findings).toHaveLength(0);
});

test("starts one exact-revision run and completes with six findings", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const result = await page.evaluate(
    async ({ variant, findings }) => {
      const data = (
        window as unknown as {
          __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
        }
      ).__LINKGO_DRAFTS_TEST_API__;
      const run = await data.startDraftAiAuditRun({
        draftVariantId: variant.id,
        contentRevision: variant.contentRevision,
        providerKey: "dry_run",
        modelName: "audit-model",
      });
      let duplicateError = "";
      try {
        await data.startDraftAiAuditRun({
          draftVariantId: variant.id,
          contentRevision: variant.contentRevision,
        });
      } catch (error) {
        duplicateError = error instanceof Error ? error.message : String(error);
      }
      await data.completeDraftAiAuditRun({
        auditRunId: run.id,
        draftVariantId: variant.id,
        contentRevision: variant.contentRevision,
        summary: "Six provider-authored findings accepted.",
        findings,
      });
      return { run, duplicateError };
    },
    { variant, findings },
  );

  expect(result.run).toMatchObject({
    draft_variant_id: variant.id,
    content_revision: variant.contentRevision,
    provider_key: "dry_run",
    model_name: "audit-model",
    status: "running",
  });
  expect(result.duplicateError).toBe(
    "An active AI audit already exists for this draft revision",
  );

  const state = await getAuditState(page);
  expect(state.runs).toHaveLength(1);
  expect(state.runs[0]).toMatchObject({
    status: "completed",
    summary: "Six provider-authored findings accepted.",
    error_message: "",
  });
  expect(state.findings).toHaveLength(6);
  expect(state.findings.map((finding) => finding.rule_key)).toEqual(RULE_KEYS);
});

test("listDrafts exposes only current-revision AI audit state", async ({
  page,
}) => {
  const variants = {
    noRun: await seedVariant(page),
    running: await seedVariant(page),
    completed: await seedVariant(page),
    failed: await seedVariant(page),
    staleCompleted: await seedVariant(page),
  };

  const readModels = await page.evaluate(
    async ({ variants, findings }) => {
      const data = (
        window as unknown as {
          __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
        }
      ).__LINKGO_DRAFTS_TEST_API__;

      await data.startDraftAiAuditRun({
        draftVariantId: variants.running.id,
        contentRevision: variants.running.contentRevision,
      });

      const completedRun = await data.startDraftAiAuditRun({
        draftVariantId: variants.completed.id,
        contentRevision: variants.completed.contentRevision,
      });
      await data.completeDraftAiAuditRun({
        auditRunId: completedRun.id,
        draftVariantId: variants.completed.id,
        contentRevision: variants.completed.contentRevision,
        findings: [...findings].reverse(),
      });

      const failedRun = await data.startDraftAiAuditRun({
        draftVariantId: variants.failed.id,
        contentRevision: variants.failed.contentRevision,
      });
      await data.failDraftAiAuditRun({
        auditRunId: failedRun.id,
        draftVariantId: variants.failed.id,
        contentRevision: variants.failed.contentRevision,
        errorMessage: "Provider audit failed.",
      });

      const staleRun = await data.startDraftAiAuditRun({
        draftVariantId: variants.staleCompleted.id,
        contentRevision: variants.staleCompleted.contentRevision,
      });
      await data.completeDraftAiAuditRun({
        auditRunId: staleRun.id,
        draftVariantId: variants.staleCompleted.id,
        contentRevision: variants.staleCompleted.contentRevision,
        findings,
      });
      await data.updateDraftVariant({
        id: variants.staleCompleted.id,
        body: "A real edit makes the completed audit stale.",
      });

      const drafts = await data.listDrafts(1);
      return Object.fromEntries(
        drafts.flatMap((draft) =>
          draft.variants.map((variant: DraftVariantWithAudits) => [
            variant.id,
            variant.aiAudit,
          ]),
        ),
      );
    },
    { variants, findings },
  );

  expect(readModels[variants.noRun.id]).toEqual({
    status: null,
    run: null,
    findings: [],
  });
  expect(readModels[variants.running.id]).toMatchObject({
    status: "running",
    run: { content_revision: 1, status: "running" },
    findings: [],
  });
  expect(readModels[variants.completed.id]).toMatchObject({
    status: "completed",
    run: { content_revision: 1, status: "completed" },
  });
  expect(
    readModels[variants.completed.id]?.findings.map(
      (finding: { rule_key: string }) => finding.rule_key,
    ),
  ).toEqual(RULE_KEYS);
  expect(readModels[variants.failed.id]).toMatchObject({
    status: "failed",
    run: { status: "failed", error_message: "Provider audit failed." },
    findings: [],
  });
  expect(readModels[variants.staleCompleted.id]).toEqual({
    status: null,
    run: null,
    findings: [],
  });
});

test("keeps the current AI audit revision for normalized no-op edits", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const result = await page.evaluate(
    async ({ variant, findings }) => {
      const testWindow = window as unknown as {
        __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
        __LINKGO_SQL_DRAFT_VARIANTS__: () => Array<{
          id: number;
          hook: string;
          body: string;
          cta: string;
          hashtags: string;
          content_revision: number;
        }>;
      };
      const data = testWindow.__LINKGO_DRAFTS_TEST_API__;
      const run = await data.startDraftAiAuditRun({
        draftVariantId: variant.id,
        contentRevision: variant.contentRevision,
      });

      await data.updateDraftVariant({
        id: variant.id,
        hook: "  Exact revision hook  ",
        body: "\nExact revision body with a concrete operator detail.\n",
        cta: "  Review the exact revision.  ",
        hashtags: "  #Linkgo  ",
      });
      const storedVariant = testWindow
        .__LINKGO_SQL_DRAFT_VARIANTS__()
        .find((candidate) => candidate.id === variant.id);

      await data.completeDraftAiAuditRun({
        auditRunId: run.id,
        draftVariantId: variant.id,
        contentRevision: variant.contentRevision,
        summary: "The normalized no-op preserved this audit revision.",
        findings,
      });

      return storedVariant;
    },
    { variant, findings },
  );

  expect(result).toMatchObject({
    hook: "Exact revision hook",
    body: "Exact revision body with a concrete operator detail.",
    cta: "Review the exact revision.",
    hashtags: "#Linkgo",
    content_revision: variant.contentRevision,
  });
  const state = await getAuditState(page);
  expect(state.runs[0]).toMatchObject({
    status: "completed",
    content_revision: variant.contentRevision,
  });
  expect(state.findings).toHaveLength(6);
});

test("increments the content revision exactly once for a normalized real edit", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const result = await page.evaluate(async (draftVariantId) => {
    const testWindow = window as unknown as {
      __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
      __LINKGO_SQL_DRAFT_VARIANTS__: () => Array<{
        id: number;
        body: string;
        content_revision: number;
      }>;
    };
    const data = testWindow.__LINKGO_DRAFTS_TEST_API__;
    const readVariant = () =>
      testWindow
        .__LINKGO_SQL_DRAFT_VARIANTS__()
        .find((candidate) => candidate.id === draftVariantId);

    await data.updateDraftVariant({
      id: draftVariantId,
      body: "  Edited body creates content revision two.  ",
    });
    const afterRealEdit = readVariant();
    await data.updateDraftVariant({
      id: draftVariantId,
      body: "\nEdited body creates content revision two.\n",
    });
    const afterNormalizedNoOp = readVariant();

    return { afterRealEdit, afterNormalizedNoOp };
  }, variant.id);

  expect(result.afterRealEdit).toMatchObject({
    body: "Edited body creates content revision two.",
    content_revision: variant.contentRevision + 1,
  });
  expect(result.afterNormalizedNoOp).toEqual(result.afterRealEdit);
});

test("rejects stale revisions and records a failure for the original run", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const result = await page.evaluate(
    async ({ variant, findings }) => {
      const data = (
        window as unknown as {
          __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
        }
      ).__LINKGO_DRAFTS_TEST_API__;
      const run = await data.startDraftAiAuditRun({
        draftVariantId: variant.id,
        contentRevision: variant.contentRevision,
      });
      await data.updateDraftVariant({
        id: variant.id,
        body: "Edited body creates content revision two.",
      });

      let completionError = "";
      try {
        await data.completeDraftAiAuditRun({
          auditRunId: run.id,
          draftVariantId: variant.id,
          contentRevision: variant.contentRevision,
          findings,
        });
      } catch (error) {
        completionError =
          error instanceof Error ? error.message : String(error);
      }
      await data.failDraftAiAuditRun({
        auditRunId: run.id,
        draftVariantId: variant.id,
        contentRevision: variant.contentRevision,
        errorMessage: completionError,
      });

      let staleStartError = "";
      try {
        await data.startDraftAiAuditRun({
          draftVariantId: variant.id,
          contentRevision: variant.contentRevision,
        });
      } catch (error) {
        staleStartError =
          error instanceof Error ? error.message : String(error);
      }
      const nextRun = await data.startDraftAiAuditRun({
        draftVariantId: variant.id,
        contentRevision: variant.contentRevision + 1,
      });
      return { completionError, staleStartError, nextRun };
    },
    { variant, findings },
  );

  expect(result.completionError).toBe(
    "Draft content changed before the AI audit completed",
  );
  expect(result.staleStartError).toBe(
    "Draft AI audit must start against the current content revision",
  );
  expect(result.nextRun).toMatchObject({
    content_revision: 2,
    status: "running",
  });

  const state = await getAuditState(page);
  expect(state.runs[0]).toMatchObject({
    status: "failed",
    error_message: "Draft content changed before the AI audit completed",
  });
  expect(state.runs[0]?.completed_at).not.toBeNull();
  expect(state.findings).toHaveLength(0);
});

test("validates six categories before writing and rolls back partial completion", async ({
  page,
}) => {
  const variant = await seedVariant(page);
  const result = await page.evaluate(
    async ({ variant, findings }) => {
      const data = (
        window as unknown as {
          __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
        }
      ).__LINKGO_DRAFTS_TEST_API__;
      const run = await data.startDraftAiAuditRun({
        draftVariantId: variant.id,
        contentRevision: variant.contentRevision,
      });
      const duplicateFindings = findings.map((finding) => ({
        ...finding,
        ruleKey: "hook" as const,
      }));
      let validationError = "";
      try {
        await data.completeDraftAiAuditRun({
          auditRunId: run.id,
          draftVariantId: variant.id,
          contentRevision: variant.contentRevision,
          findings: duplicateFindings,
        });
      } catch (error) {
        validationError =
          error instanceof Error ? error.message : String(error);
      }

      (
        window as unknown as {
          __LINKGO_FAIL_DRAFT_AI_AUDIT_FINDING_INSERT_AT__: number;
        }
      ).__LINKGO_FAIL_DRAFT_AI_AUDIT_FINDING_INSERT_AT__ = 3;
      let insertionError = "";
      try {
        await data.completeDraftAiAuditRun({
          auditRunId: run.id,
          draftVariantId: variant.id,
          contentRevision: variant.contentRevision,
          findings,
        });
      } catch (error) {
        insertionError = error instanceof Error ? error.message : String(error);
      }
      return { validationError, insertionError };
    },
    { variant, findings },
  );

  expect(result.validationError).toContain(
    "findings must contain exactly one entry for each required audit category",
  );
  expect(result.insertionError).toBe(
    "Injected draft AI audit finding insert failure",
  );

  const state = await getAuditState(page);
  expect(state.runs[0]).toMatchObject({
    status: "running",
    completed_at: null,
  });
  expect(state.findings).toHaveLength(0);
});

test("reconciles crashes at every draft audit transaction boundary and preserves terminal evidence", async ({
  page,
}) => {
  const { ids, result } = await page.evaluate(async () => {
    const testWindow = window as unknown as {
      __LINKGO_SQL_SEED_DRAFT_AI_AUDIT_RECOVERY__: () => Record<string, number>;
      __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
    };
    const ids = testWindow.__LINKGO_SQL_SEED_DRAFT_AI_AUDIT_RECOVERY__();
    const result =
      await testWindow.__LINKGO_DRAFTS_TEST_API__.reconcileDraftAiAuditLifecycle();
    return { ids, result };
  });

  expect(result.failedAuditRunIds).toEqual([
    ids.reservedAudit,
    ids.unlinkedAudit,
    ids.queuedAudit,
    ids.runningAudit,
    ids.waitingAudit,
    ids.completedAudit,
  ]);
  expect(result.failedAgentRunIds).toEqual([
    ids.queuedAgent,
    ids.runningAgent,
    ids.waitingAgent,
    ids.orphanAgent,
  ]);
  expect(result.clearedApprovalCheckpointCount).toBe(1);

  const state = await getAuditState(page);
  const auditById = (id: number) => state.runs.find((run) => run.id === id);
  const agentById = (id: number) =>
    state.agents.find((agent) => agent.id === id);

  expect(auditById(ids.reservedAudit)).toMatchObject({
    status: "failed",
    agent_run_id: null,
  });
  expect(auditById(ids.unlinkedAudit)).toMatchObject({
    status: "failed",
    agent_run_id: null,
  });
  expect(auditById(ids.queuedAudit)?.status).toBe("failed");
  expect(auditById(ids.runningAudit)?.status).toBe("failed");
  expect(auditById(ids.waitingAudit)?.status).toBe("failed");
  expect(agentById(ids.orphanAgent)?.status).toBe("failed");
  expect(agentById(ids.queuedAgent)?.status).toBe("failed");
  expect(agentById(ids.runningAgent)?.status).toBe("failed");
  expect(agentById(ids.waitingAgent)?.status).toBe("failed");
  expect(state.checkpoints).toHaveLength(0);

  expect(auditById(ids.completedAudit)).toMatchObject({
    status: "failed",
    summary: "Preserved audit-side evidence.",
  });
  expect(agentById(ids.completedAgent)).toMatchObject({
    status: "completed",
    output_summary: "Preserved terminal provider evidence.",
    error_message: "",
  });
  expect(
    state.toolCalls.find((toolCall) => toolCall.id === ids.completedToolCall),
  ).toMatchObject({
    status: "completed",
    output_json: JSON.stringify({ evidence: "preserved" }),
  });

  expect(auditById(ids.freshAudit)?.status).toBe("pending");
  expect(agentById(ids.freshAgent)?.status).toBe("running");
  expect(agentById(ids.unrelatedAgent)?.status).toBe("running");
  expect(
    state.events.filter((event) => event.event_type === "run_failed"),
  ).toHaveLength(4);
});

test("bounds each reconciliation candidate class", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const testWindow = window as unknown as {
      __LINKGO_SQL_SEED_DRAFT_AI_AUDIT_RECOVERY__: () => Record<string, number>;
      __LINKGO_DRAFTS_TEST_API__: DraftAuditTestApi;
    };
    testWindow.__LINKGO_SQL_SEED_DRAFT_AI_AUDIT_RECOVERY__();
    return testWindow.__LINKGO_DRAFTS_TEST_API__.reconcileDraftAiAuditLifecycle(
      {
        maxAuditRuns: 1,
        maxOrphanAgentRuns: 1,
      },
    );
  });

  expect(result.failedAuditRunIds).toHaveLength(1);
  expect(result.failedAgentRunIds).toHaveLength(1);
});
