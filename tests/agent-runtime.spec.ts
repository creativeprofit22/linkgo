import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

test("renders six typed tool contracts with approval metadata", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openAgentRuntime(page);

  for (const toolName of [
    "research_posts",
    "score_relevance",
    "draft_post",
    "audit_post",
    "schedule_post",
    "collect_metrics",
  ] as const) {
    await expect(page.getByText(toolName, { exact: true })).toBeVisible();
  }

  await expect(getToolCard(page, "schedule_post")).toContainText(
    "Approval required",
  );
  await expect(page.getByText("No agent runs yet")).toBeVisible();
});

test("persists a completed dry-run with tool calls and events", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openAgentRuntime(page);
  await createDryRun(page);

  await page.getByRole("button", { name: "Start Dry run" }).click();

  await expect(getBadge(page, "Completed").first()).toBeVisible();
  await expect(
    page.getByText("research_posts", { exact: true }).nth(1),
  ).toBeVisible();
  await expect(page.getByText("Tool completed")).toBeVisible();
  await expect(page.getByText("Run completed")).toBeVisible();

  const counts = await getStateCounts(page);
  const toolCalls = await getAgentToolCalls(page);
  expect(counts.agentRuns).toBe(1);
  expect(counts.agentToolCalls).toBe(1);
  expect(counts.agentRunEvents).toBeGreaterThanOrEqual(5);
  expect(toolCalls[0]?.provider_tool_call_id).toBe("dry-run-1-tool-call-2");
  const runs = await getAgentRuns(page);
  expect(runs[0]?.iteration_count).toBe(2);
});

test("failed quality-owned agent offers no Start and points to Drafts", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await page.evaluate(async () => {
    const w = window as unknown as {
      __LINKGO_SQL_SEED_QUALITY_RECOVERY__: (
        status: string,
        attempt: number,
        stale: boolean,
      ) => Promise<{ qualityRunId: number; draftVariantId: number }>;
      __LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__: () => {
        draftQualityAttempts: { id: number; run_id: number }[];
      };
      __TAURI_INTERNALS__: {
        invoke: (command: string, args: unknown) => Promise<unknown>;
      };
    };
    // A running quality loop whose scorer agent is then failed by the loop.
    const scope = await w.__LINKGO_SQL_SEED_QUALITY_RECOVERY__(
      "running",
      1,
      false,
    );
    const attempt = w
      .__LINKGO_SQL_QUALITY_RECOVERY_SNAPSHOT__()
      .draftQualityAttempts.find((row) => row.run_id === scope.qualityRunId);
    await w.__TAURI_INTERNALS__.invoke("linkgo_draft_quality_fail", {
      input: {
        ...scope,
        attemptId: attempt?.id,
        errorMessage: "Provider failed",
      },
    });
  });
  await openAgentRuntime(page);

  await expect(getBadge(page, "Failed").first()).toBeVisible();
  await expect(
    page.getByText("Owned by the draft quality loop — resume it from Drafts."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Start / })).toHaveCount(0);
});

test("dry-run researcher persists discovery items through research_posts", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openAgentRuntime(page);
  await createDryRun(page);

  await page.getByRole("button", { name: "Start Dry run" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();

  const counts = await getStateCounts(page);
  expect(counts.candidateDiscoveryItems).toBe(3);
});

test("dry-run scorer applies candidate scores through score_relevance", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await insertCandidateForScoring(page);
  await openAgentRuntime(page);
  await createDryRun(
    page,
    "scorer",
    "",
    "Candidate IDs: 1. Auto-reject: true.",
  );

  await page.getByRole("button", { name: "Start Dry run" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();

  const candidateScores = await page.evaluate(() => {
    const getCandidates = (
      window as unknown as {
        __LINKGO_SQL_CANDIDATE_POSTS__?: () => Array<{
          relevance_score: number | null;
          score_reason: string;
        }>;
      }
    ).__LINKGO_SQL_CANDIDATE_POSTS__;
    return getCandidates?.().map((candidate) => ({
      relevanceScore: candidate.relevance_score,
      scoreReason: candidate.score_reason,
    }));
  });
  expect(candidateScores?.[0]).toEqual({
    relevanceScore: 78,
    scoreReason:
      "Dry-run score: strong campaign fit with a clear operator lesson.",
  });
});

test("dry-run auditor persists exact identities and echoes provider-authored findings", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openAgentRuntime(page);
  await createDryRun(page, "auditor");

  await page.getByRole("button", { name: "Start Dry run" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();

  const toolCall = (await getAgentToolCalls(page))[0];
  const input = JSON.parse(toolCall?.input_json ?? "{}") as {
    campaignId: number;
    draftVariantId: number;
    contentRevision: number;
    auditRunId: number;
    findings: Array<{ ruleKey: string; message: string }>;
  };
  const output = JSON.parse(toolCall?.output_json ?? "{}") as {
    findings: Array<{ ruleKey: string; message: string }>;
  };

  expect(input).toMatchObject({
    campaignId: 1,
    draftVariantId: 1,
    contentRevision: 1,
    auditRunId: 1,
  });
  expect(input.findings.map((finding) => finding.ruleKey)).toEqual([
    "hook",
    "specificity",
    "generic_language",
    "authenticity",
    "clarity",
    "safety",
  ]);
  expect(output.findings).toEqual(input.findings);
  expect(JSON.stringify(output)).not.toContain("contract_valid");
});

test("starts a provider-backed run through the native command boundary", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
        __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown;
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute(args: unknown): unknown {
        (
          window as unknown as { __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown }
        ).__LINKGO_PROVIDER_COMMAND_ARGS__ = args;
        return {
          chunks: [
            { type: "text", text: "Provider stream started." },
            { type: "done", outputSummary: "Provider run completed." },
          ],
        };
      },
    };
  });

  await page.getByRole("button", { name: /Integrations/ }).click();
  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("sk-test-custom-key");
  await dialog
    .getByLabel("Base URL override (required)")
    .fill("https://custom.example.com/v1");
  await dialog.getByLabel("Account label").fill("Runtime Custom API");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /Playbooks/ }).click();
  const writerCard = getPlaybookCard(page, "LinkedIn Writer");
  const customInstructions =
    "Prefer punchy operator lessons with one concrete metric.";
  await writerCard
    .getByLabel("Custom runtime instructions")
    .fill(customInstructions);
  await writerCard.getByRole("button", { name: "Save playbook" }).click();
  await expect(
    writerCard.getByLabel("Custom runtime instructions"),
  ).toHaveValue(customInstructions);

  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "drafter", "linkedin_writer");

  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();
  await expect(page.getByText("Provider run completed.").first()).toBeVisible();

  const runs = await getAgentRuns(page);
  const toolCalls = await getAgentToolCalls(page);
  expect(runs[0]?.status).toBe("completed");
  expect(runs[0]?.playbook_key).toBe("linkedin_writer");
  expect(toolCalls).toEqual([]);
  const commandArgs = await page.evaluate(
    () =>
      (window as unknown as { __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown })
        .__LINKGO_PROVIDER_COMMAND_ARGS__,
  );
  expect(commandArgs).toEqual({
    input: {
      providerKey: "custom",
      modelName: "custom-model",
      request: expect.objectContaining({ messages: expect.any(Array) }),
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: "draft_post",
          inputSchema: expect.objectContaining({
            required: [
              "draftGenerationRequestId",
              "campaignId",
              "candidatePostId",
              "contentIntent",
              "variants",
            ],
          }),
        }),
      ]),
      toolChoice: "auto",
    },
  });
  expect(commandArgs).not.toHaveProperty("input.provider");
  expect(commandArgs).not.toHaveProperty("input.apiKey");
  expect(commandArgs).not.toHaveProperty("input.baseUrl");
  expect(commandArgs).not.toHaveProperty("input.messages");
  const serializedCommandArgs = JSON.stringify(commandArgs);
  expect(serializedCommandArgs).not.toContain("sk-test-custom-key");
  expect(serializedCommandArgs).not.toContain("https://custom.example.com/v1");
  expect(serializedCommandArgs).toContain("LinkedIn Writer playbook");
  expect(serializedCommandArgs).toContain("Selected playbook: LinkedIn Writer");
  expect(serializedCommandArgs).toContain(
    "Operator custom playbook instructions:",
  );
  expect(serializedCommandArgs).toContain(customInstructions);
});

test("feeds a validated tool result into a second provider turn before completion", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
        __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown;
        __LINKGO_PROVIDER_COMMAND_CALLS__?: unknown[];
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute(args: unknown): unknown {
        const testWindow = window as unknown as {
          __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown;
          __LINKGO_PROVIDER_COMMAND_CALLS__?: unknown[];
        };
        testWindow.__LINKGO_PROVIDER_COMMAND_ARGS__ = args;
        testWindow.__LINKGO_PROVIDER_COMMAND_CALLS__ = [
          ...(testWindow.__LINKGO_PROVIDER_COMMAND_CALLS__ ?? []),
          args,
        ];
        const request = (
          args as {
            input: { request: { messages: Array<{ role: string }> } };
          }
        ).input.request;
        if (request.messages.some((message) => message.role === "tool")) {
          return {
            chunks: [
              {
                type: "done",
                outputSummary: "Provider research completed after tool result.",
              },
            ],
          };
        }
        return {
          chunks: [
            {
              type: "tool_call",
              providerToolCallId: "provider-research-1",
              toolName: "research_posts",
              input: {
                campaignId: 1,
                keywords: ["founder content"],
                maxPosts: 1,
                suggestions: [
                  {
                    kind: "keyword",
                    title: "Provider supplied keyword",
                    keyword: "provider keyword",
                    rationale:
                      "Provider-generated suggestion through native boundary.",
                    sourceKeyword: "founder content",
                    confidenceScore: 91,
                  },
                ],
              },
            },
            { type: "done", outputSummary: "Provider requested research." },
          ],
        };
      },
    };
  });
  await page.getByRole("button", { name: /Integrations/ }).click();
  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("sk-test-custom-key");
  await dialog
    .getByLabel("Base URL override (required)")
    .fill("https://custom.example.com/v1");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "researcher");

  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();

  const counts = await getStateCounts(page);
  expect(counts.candidateDiscoveryItems).toBe(1);
  const providerCalls = await page.evaluate(
    () =>
      (
        window as unknown as {
          __LINKGO_PROVIDER_COMMAND_CALLS__?: Array<{
            input: {
              request: {
                messages: Array<{
                  role: string;
                  content: string;
                  toolName?: string;
                  providerToolCallId?: string;
                }>;
              };
            };
          }>;
        }
      ).__LINKGO_PROVIDER_COMMAND_CALLS__ ?? [],
  );
  expect(providerCalls).toHaveLength(2);
  expect(
    providerCalls[0]?.input.request.messages.some(
      (message) => message.role === "tool",
    ),
  ).toBe(false);
  const secondTurnMessages = providerCalls[1]?.input.request.messages ?? [];
  const toolCallMessage = secondTurnMessages.at(-2);
  const toolResultMessage = secondTurnMessages.at(-1);
  expect(toolCallMessage).toMatchObject({
    role: "assistant",
    toolName: "research_posts",
    providerToolCallId: "provider-research-1",
  });
  expect(toolResultMessage).toMatchObject({
    role: "tool",
    toolName: "research_posts",
    providerToolCallId: "provider-research-1",
  });
  expect(JSON.parse(toolResultMessage?.content ?? "{}")).toMatchObject({
    discoveryItems: [
      expect.objectContaining({
        keyword: "provider keyword",
        status: "suggested",
      }),
    ],
  });
  const runs = await getAgentRuns(page);
  expect(runs[0]?.iteration_count).toBe(2);
  expect(runs[0]?.output_summary).toBe(
    "Provider research completed after tool result.",
  );
  expect(JSON.stringify(providerCalls)).not.toContain("[REDACTED]");
});

test("provider-backed score_relevance calls persist model-supplied scores", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
        __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown;
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute(args: unknown): unknown {
        (
          window as unknown as { __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown }
        ).__LINKGO_PROVIDER_COMMAND_ARGS__ = args;
        const messages = (
          args as {
            input: { request: { messages: Array<{ role: string }> } };
          }
        ).input.request.messages;
        if (messages.some((message) => message.role === "tool")) {
          return {
            chunks: [
              { type: "done", outputSummary: "Provider scoring completed." },
            ],
          };
        }
        return {
          chunks: [
            {
              type: "tool_call",
              providerToolCallId: "provider-score-1",
              toolName: "score_relevance",
              input: {
                campaignId: 1,
                candidatePostIds: [1],
                minimumScore: 60,
                scores: [
                  {
                    candidatePostId: 1,
                    score: 84,
                    rationale:
                      "Provider score: strong fit with a specific operator lesson.",
                  },
                ],
                autoRejectBelowMinimum: true,
              },
            },
            { type: "done", outputSummary: "Provider scoring completed." },
          ],
        };
      },
    };
  });
  await page.getByRole("button", { name: /Integrations/ }).click();
  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("sk-test-custom-key");
  await dialog
    .getByLabel("Base URL override (required)")
    .fill("https://custom.example.com/v1");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await insertCandidateForScoring(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "scorer");

  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();

  const candidateScores = await page.evaluate(() => {
    const getCandidates = (
      window as unknown as {
        __LINKGO_SQL_CANDIDATE_POSTS__?: () => Array<{
          relevance_score: number | null;
          score_reason: string;
        }>;
      }
    ).__LINKGO_SQL_CANDIDATE_POSTS__;
    return getCandidates?.().map((candidate) => ({
      relevanceScore: candidate.relevance_score,
      scoreReason: candidate.score_reason,
    }));
  });
  expect(candidateScores?.[0]).toEqual({
    relevanceScore: 84,
    scoreReason: "Provider score: strong fit with a specific operator lesson.",
  });
  const serializedCommandArgs = JSON.stringify(
    await page.evaluate(
      () =>
        (window as unknown as { __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown })
          .__LINKGO_PROVIDER_COMMAND_ARGS__,
    ),
  );
  expect(serializedCommandArgs).not.toContain("sk-test-custom-key");
  expect(serializedCommandArgs).not.toContain("https://custom.example.com/v1");
});

test("provider duplicate research_posts calls are rejected before local writes", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute(args: unknown): unknown {
        const messages = (
          args as {
            input: { request: { messages: Array<{ role: string }> } };
          }
        ).input.request.messages;
        if (messages.some((message) => message.role === "tool")) {
          return {
            chunks: [
              { type: "done", outputSummary: "Provider research completed." },
            ],
          };
        }
        const duplicateToolCall = {
          type: "tool_call",
          providerToolCallId: "provider-research-duplicate",
          toolName: "research_posts",
          input: {
            campaignId: 1,
            keywords: ["founder content"],
            maxPosts: 1,
            suggestions: [
              {
                kind: "keyword",
                title: "Duplicate-safe keyword",
                keyword: "duplicate safe keyword",
                rationale: "Provider emitted the same tool call twice.",
                sourceKeyword: "founder content",
                confidenceScore: 88,
              },
            ],
          },
        };
        return {
          chunks: [
            duplicateToolCall,
            duplicateToolCall,
            { type: "done", outputSummary: "Provider research completed." },
          ],
        };
      },
    };
  });
  await page.getByRole("button", { name: /Integrations/ }).click();
  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("sk-test-custom-key");
  await dialog
    .getByLabel("Base URL override (required)")
    .fill("https://custom.example.com/v1");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "researcher");

  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();

  const counts = await getStateCounts(page);
  const toolCalls = await getAgentToolCalls(page);
  expect(counts.candidateDiscoveryItems).toBe(1);
  expect(counts.agentToolCalls).toBe(2);
  expect(toolCalls.map((call) => call.status)).toEqual([
    "completed",
    "rejected",
  ]);
  await expect(
    page.getByText("Duplicate provider tool call ignored.", { exact: true }),
  ).toBeVisible();
});

test("rejects research_posts writes for a different campaign", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute(args: unknown): unknown {
        const request = (args as { input: { request: { campaignId: number } } })
          .input.request;
        return {
          chunks: [
            {
              type: "tool_call",
              providerToolCallId: "provider-research-cross-campaign",
              toolName: "research_posts",
              input: {
                campaignId: request.campaignId === 1 ? 2 : 1,
                keywords: ["cross-campaign"],
                maxPosts: 1,
                suggestions: [
                  {
                    kind: "keyword",
                    title: "Cross-campaign write",
                    keyword: "cross-campaign",
                    rationale: "This write must be rejected.",
                    sourceKeyword: "cross-campaign",
                    confidenceScore: 100,
                  },
                ],
              },
            },
            { type: "done", outputSummary: "Cross-campaign research." },
          ],
        };
      },
    };
  });
  await connectCustomProvider(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await createCampaign(page, "Second campaign");
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "researcher");

  await page.getByRole("button", { name: "Start Custom API" }).click();

  await expect(getBadge(page, "Failed").first()).toBeVisible();
  const errorMessage = "Research request belongs to a different campaign";
  const runs = await getAgentRuns(page);
  expect(runs[0]).toMatchObject({
    status: "failed",
    error_message: errorMessage,
  });
  const toolCalls = await getAgentToolCalls(page);
  expect(toolCalls).toHaveLength(1);
  expect(toolCalls[0]).toMatchObject({
    tool_name: "research_posts",
    status: "failed",
    error_message: errorMessage,
  });
  expect((await getStateCounts(page)).candidateDiscoveryItems).toBe(0);
});

for (const approvalPosition of ["first", "second"] as const) {
  test(`fails closed before tool execution when approval is ${approvalPosition} in a two-call turn`, async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await installMixedApprovalTurnProvider(page, approvalPosition);
    await connectCustomProvider(page);
    await page.getByRole("button", { name: /Campaigns/ }).click();
    await createCampaign(page);
    await seedApproval(page);
    await openAgentRuntime(page);
    await createProviderRun(page, "custom", "scheduler");

    await page.getByRole("button", { name: "Start Custom API" }).click();

    await expect(getBadge(page, "Failed").first()).toBeVisible();
    const errorMessage =
      "Provider turn rejected before tool execution: approval-required tool call schedule_post must be isolated; received 2 tool calls.";
    const runs = await getAgentRuns(page);
    expect(runs[0]).toMatchObject({
      status: "failed",
      error_message: errorMessage,
    });
    const counts = await getStateCounts(page);
    expect(counts.agentToolCalls).toBe(0);
    expect(counts.agentApprovalCheckpoints).toBe(0);
    expect(counts.candidateDiscoveryItems).toBe(0);
    expect(counts.scheduleJobs).toBe(0);
    expect(counts.publishAttempts).toBe(0);
    expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
  });
}

test("starts an Anthropic provider-backed run through the native command boundary", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
        __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown;
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute(args: unknown): unknown {
        (
          window as unknown as { __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown }
        ).__LINKGO_PROVIDER_COMMAND_ARGS__ = args;
        return {
          chunks: [
            { type: "text", text: "Anthropic stream started." },
            { type: "done", outputSummary: "Anthropic run completed." },
          ],
        };
      },
    };
  });

  await page.getByRole("button", { name: /Integrations/ }).click();
  const anthropicCard = page
    .getByText("Anthropic", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await anthropicCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "Anthropic connection" });
  await dialog
    .getByLabel("Anthropic API key or OAuth token")
    .fill("sk-ant-test-key");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "anthropic");

  await page.getByRole("button", { name: "Start Anthropic" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();
  await expect(
    page.getByText("Anthropic run completed.").first(),
  ).toBeVisible();

  const commandArgs = await page.evaluate(
    () =>
      (window as unknown as { __LINKGO_PROVIDER_COMMAND_ARGS__?: unknown })
        .__LINKGO_PROVIDER_COMMAND_ARGS__,
  );
  expect(commandArgs).toEqual({
    input: {
      providerKey: "anthropic",
      modelName: "claude-sonnet-4-6",
      request: expect.objectContaining({ messages: expect.any(Array) }),
      tools: [expect.objectContaining({ name: "research_posts" })],
      toolChoice: "auto",
    },
  });
  expect(commandArgs).not.toHaveProperty("input.provider");
  expect(commandArgs).not.toHaveProperty("input.apiKey");
  expect(commandArgs).not.toHaveProperty("input.baseUrl");
  expect(commandArgs).not.toHaveProperty("input.messages");
  expect(JSON.stringify(commandArgs)).not.toContain("sk-ant-test-key");
});

test("starts an OpenAI run after the account sign-in access token expired", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await installSuccessfulContinuationProvider(page, "OpenAI renewed run.");
  await signInOpenAiAccount(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await setOpenAiSignInState(page, "expired");

  await openAgentRuntime(page);
  await createProviderRun(page, "openai");
  await page.getByRole("button", { name: "Start OpenAI" }).click();

  await expect(getBadge(page, "Completed").first()).toBeVisible();
  await expect(page.getByText("OpenAI renewed run.").first()).toBeVisible();
  await expect(page.getByText("Agent provider is not connected")).toHaveCount(
    0,
  );
});

test("keeps a revoked OpenAI account sign-in blocked as not connected", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await installSuccessfulContinuationProvider(page, "Must not run.");
  await signInOpenAiAccount(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "openai");

  await setOpenAiSignInState(page, "reauth_required");
  const message = await page.evaluate(async () => {
    const start = (
      window as unknown as {
        __LINKGO_AGENT_RUNTIME_TEST_API__?: {
          startAgentRun: (input: { id: number }) => Promise<void>;
        };
      }
    ).__LINKGO_AGENT_RUNTIME_TEST_API__?.startAgentRun;
    if (!start) return "Agent runtime test API was not initialized";
    try {
      await start({ id: 1 });
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(message).toBe("Agent provider is not connected");
  expect((await getAgentRuns(page))[0]?.status).not.toBe("completed");

  await page.getByRole("button", { name: /Campaigns/ }).click();
  await openAgentRuntime(page);
  await page.getByRole("button", { name: "Create run" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create agent run" });
  await dialog.getByLabel("Provider").selectOption("openai");
  await expect(
    dialog.getByText(
      "Connect OpenAI in Integrations before creating this run.",
    ),
  ).toBeVisible();
});

test("selects the LinkedIn writer playbook for drafter runs", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openAgentRuntime(page);

  await createDryRun(page, "drafter", "linkedin_writer");

  await expect(page.getByText("Playbook: LinkedIn Writer")).toBeVisible();
  const runs = await getAgentRuns(page);
  expect(runs[0]?.playbook_key).toBe("linkedin_writer");

  await page.getByRole("button", { name: "Start Dry run" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();
  await expect(
    page.getByText("with playbook LinkedIn Writer (linkedin_writer)").first(),
  ).toBeVisible();
  const toolPayload = await page.evaluate(() => {
    const getToolCalls = (
      window as unknown as {
        __LINKGO_SQL_AGENT_TOOL_CALLS__: () => Array<{
          input_json: string;
          output_json: string;
        }>;
      }
    ).__LINKGO_SQL_AGENT_TOOL_CALLS__;
    const toolCall = getToolCalls()[0];
    return {
      input: JSON.parse(toolCall?.input_json ?? "{}") as {
        draftGenerationRequestId: number;
        variantCount: number;
        contentIntent: string;
        variants: Array<{ hook: string; body: string }>;
      },
      output: JSON.parse(toolCall?.output_json ?? "{}") as {
        variants: Array<{ hook: string; body: string }>;
      },
    };
  });
  expect(toolPayload.input).toMatchObject({
    draftGenerationRequestId: 1,
    variantCount: 3,
    contentIntent: "idea",
  });
  expect(toolPayload.input.variants.map((variant) => variant.hook)).toEqual([
    "Dry-run provider hook 1: idea insight",
    "Dry-run provider hook 2: idea insight",
    "Dry-run provider hook 3: idea insight",
  ]);
  expect(
    new Set(toolPayload.input.variants.map((variant) => variant.body)).size,
  ).toBe(3);
  expect(toolPayload.output.variants).toEqual(toolPayload.input.variants);
});

test("hides disabled runtime playbooks from new agent runs", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Playbooks/ }).click();
  const writerCard = getPlaybookCard(page, "LinkedIn Writer");
  await writerCard.getByRole("switch", { name: "Runtime enabled" }).click();
  await writerCard.getByRole("button", { name: "Save playbook" }).click();
  await expect(writerCard.getByText("Disabled", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openAgentRuntime(page);
  await page.getByRole("button", { name: "Create run" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create agent run" });
  await dialog.getByLabel("Agent role").selectOption("drafter");
  await expect(
    dialog
      .getByLabel("Playbook")
      .locator("option", { hasText: "LinkedIn Writer" }),
  ).toHaveCount(0);
});

test("stops schedule dry-run at waiting approval without publishing", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createDryRun(page, "scheduler");

  await page.getByRole("button", { name: "Start Dry run" }).click();

  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();
  await expect(
    page.getByText("schedule_post", { exact: true }).nth(1),
  ).toBeVisible();
  await expect(page.getByText("Requires approval")).toBeVisible();
  await expect(page.getByText("Approval required").first()).toBeVisible();

  const counts = await getStateCounts(page);
  const toolCalls = await getAgentToolCalls(page);
  expect(counts.agentRuns).toBe(1);
  expect(counts.agentToolCalls).toBe(1);
  expect(counts.scheduleJobs).toBe(0);
  expect(counts.publishAttempts).toBe(0);
  expect(toolCalls[0]?.provider_tool_call_id).toBe("dry-run-1-tool-call-2");
  expect(counts.agentApprovalCheckpoints).toBe(1);
});

test("rejects checkpoint tool results without a preceding assistant call ID", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createDryRun(page, "scheduler");
  await page.getByRole("button", { name: "Start Dry run" }).click();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();

  const checkpoint = await getAgentApprovalCheckpoint(page);
  const messages = JSON.parse(checkpoint.messages_json) as unknown[];
  messages.push({
    role: "tool",
    content: "{}",
    toolName: "schedule_post",
    providerToolCallId: "orphan-provider-call",
  });
  await executeSql(page, {
    query: `UPDATE agent_run_approval_checkpoints
      SET messages_json = $1, updated_at = datetime('now')
      WHERE agent_run_id = $2`,
    values: [JSON.stringify(messages), checkpoint.agent_run_id],
  });
  await executeSql(page, {
    query: "UPDATE approvals SET status = $1 WHERE id = $2",
    values: ["approved", checkpoint.approval_id],
  });

  expect(await resumeRunThroughTestApi(page, checkpoint.agent_run_id)).toBe(
    "Agent continuation could not be settled",
  );
  const counts = await getStateCounts(page);
  expect(counts.scheduleJobs).toBe(0);
  expect(counts.publishAttempts).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
});

test("approves and explicitly resumes a durable schedule metadata continuation", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createDryRun(page, "scheduler");
  await page.getByRole("button", { name: "Start Dry run" }).click();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();
  await expect(page.getByText("Review this item in Approvals.")).toBeVisible();

  await openApprovals(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved").first()).toBeVisible();
  expect((await getStateCounts(page)).agentRuns).toBe(1);

  await openAgentRuntime(page);
  const resumeButton = page.getByRole("button", {
    name: "Resume approved run for agent run 1",
  });
  await expect(resumeButton).toBeVisible();
  await resumeButton.click();

  await expect(page.getByText("Agent continuation completed")).toBeVisible();
  await expect(getBadge(page, "Completed").first()).toBeVisible();
  const completedToolCalls = await getAgentToolCalls(page);
  expect(JSON.parse(completedToolCalls[0]?.output_json ?? "{}").summary).toBe(
    "Approval confirmed for schedule metadata only; no schedule record or publish action was created.",
  );
  const counts = await getStateCounts(page);
  expect(counts.agentApprovalCheckpoints).toBe(0);
  expect(counts.agentToolCalls).toBe(1);
  expect(counts.scheduleJobs).toBe(0);
  expect(counts.publishAttempts).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
  expect((await getAgentToolCalls(page))[0]?.status).toBe("completed");
  expect(await getContinuationSettlementInvokeCount(page)).toBe(1);
});

test("rejects custom continuation without a Base URL before checkpoint mutation", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await installScheduleApprovalProvider(page, 1, "provider-schedule-custom");
  await connectCustomProvider(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "scheduler");
  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();

  await openApprovals(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved").first()).toBeVisible();

  const checkpointBefore = await getAgentApprovalCheckpoint(page);
  expect(checkpointBefore.phase).toBe("waiting_approval");
  expect((await getAgentToolCalls(page))[0]?.status).toBe("waiting_approval");

  await page.evaluate(() => {
    const clearBaseUrl = (
      window as unknown as {
        __LINKGO_AUTH_CLEAR_BASE_URL_OVERRIDE__?: () => void;
      }
    ).__LINKGO_AUTH_CLEAR_BASE_URL_OVERRIDE__;
    if (clearBaseUrl === undefined) {
      throw new Error("Auth Base URL test API unavailable");
    }
    clearBaseUrl();
  });

  expect(await resumeRunThroughTestApi(page, 1)).toBe(
    "Custom provider requires a Base URL override",
  );

  const checkpointAfter = await getAgentApprovalCheckpoint(page);
  expect(checkpointAfter).toMatchObject({
    agent_run_id: checkpointBefore.agent_run_id,
    pending_tool_call_id: checkpointBefore.pending_tool_call_id,
    phase: "waiting_approval",
  });
  expect((await getAgentToolCalls(page))[0]?.status).toBe("waiting_approval");
  expect((await getAgentRuns(page))[0]?.status).toBe("waiting_approval");
});

test("reports a second approval interrupt without claiming continuation completion", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await installScheduleApprovalProvider(page, 1, "provider-schedule-first");
  await connectCustomProvider(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "scheduler");
  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();

  await openApprovals(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved").first()).toBeVisible();
  await seedApproval(page, 2);
  await installScheduleApprovalProvider(page, 2, "provider-schedule-second");

  await openAgentRuntime(page);
  await page
    .getByRole("button", { name: "Resume approved run for agent run 1" })
    .click();

  await expect(
    page.getByText("Agent continuation needs another approval"),
  ).toBeVisible();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();
  await expect(page.getByText("Approval #2", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Review required", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Agent continuation completed")).toHaveCount(0);
  expect((await getAgentRuns(page))[0]).toMatchObject({
    status: "waiting_approval",
    error_message: "",
  });
  expect((await getStateCounts(page)).agentApprovalCheckpoints).toBe(1);
});

test("reports recoverable provider failure with the saved continuation", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await installScheduleApprovalProvider(page, 1, "provider-schedule-first");
  await connectCustomProvider(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "scheduler");
  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();

  await openApprovals(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved").first()).toBeVisible();
  await installFailingContinuationProvider(
    page,
    "Continuation provider unavailable.",
  );

  await openAgentRuntime(page);
  await page
    .getByRole("button", { name: "Resume approved run for agent run 1" })
    .click();

  await expect(
    page.getByText("Agent continuation failed; recovery is ready"),
  ).toBeVisible();
  await expect(getBadge(page, "Failed").first()).toBeVisible();
  await expect(
    page
      .getByText("Continuation provider unavailable.", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText("Continuation saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("The approved metadata result is saved.", { exact: false }),
  ).toBeVisible();
  expect((await getAgentRuns(page))[0]).toMatchObject({
    status: "failed",
    error_message: "Continuation provider unavailable.",
  });
  expect((await getStateCounts(page)).agentApprovalCheckpoints).toBe(1);
});

test("rejecting through Approvals cancels the linked run without continuation", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createDryRun(page, "scheduler");
  await page.getByRole("button", { name: "Start Dry run" }).click();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();
  expect((await getStateCounts(page)).agentApprovalCheckpoints).toBe(1);
  await createDryRun(page, "scheduler");
  await page.getByRole("button", { name: "Start Dry run" }).click();
  expect((await getStateCounts(page)).agentApprovalCheckpoints).toBe(2);

  await openApprovals(page);
  await expect(
    page.getByText(
      "Rejection consequence: 2 linked waiting runs will be cancelled and their resumable checkpoints removed.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Reject this approval?",
  });
  await expect(confirmation).toContainText(
    "2 linked waiting runs will be cancelled and their resumable checkpoints removed. The draft will stay in local history.",
  );
  await confirmation.getByRole("button", { name: "Reject approval" }).click();
  await expect(confirmation).toBeHidden();
  await expect(getBadge(page, "Rejected").first()).toBeVisible();

  await openAgentRuntime(page);
  await expect(getBadge(page, "Cancelled")).toHaveCount(2);
  const counts = await getStateCounts(page);
  expect(counts.agentApprovalCheckpoints).toBe(0);
  expect(counts.scheduleJobs).toBe(0);
  expect(counts.publishAttempts).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
  expect(
    (await getAgentToolCalls(page)).every((call) => call.status === "rejected"),
  ).toBe(true);
  expect(
    (await getAgentRuns(page)).every(
      (run) => run.status === "cancelled" && run.iteration_count === 1,
    ),
  ).toBe(true);
});

test("reload recovery skips an approved tool after a continuation provider failure", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await enableReloadPersistence(page);
  await installScheduleApprovalProvider(page, 1, "provider-schedule-recovery");
  await connectCustomProvider(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom", "scheduler");
  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();
  await openApprovals(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved").first()).toBeVisible();
  await installFailingContinuationProvider(
    page,
    "Continuation provider unavailable.",
  );

  await openAgentRuntime(page);
  await page
    .getByRole("button", { name: "Resume approved run for agent run 1" })
    .click();

  await expect(
    page.getByText("Agent continuation failed; recovery is ready"),
  ).toBeVisible();
  await expect(getBadge(page, "Failed").first()).toBeVisible();
  expect((await getAgentRuns(page))[0]).toMatchObject({
    status: "failed",
    error_message: "Continuation provider unavailable.",
  });
  expect((await getAgentApprovalCheckpoint(page)).phase).toBe(
    "continuation_ready",
  );
  const failedToolCalls = await getAgentToolCalls(page);
  expect(failedToolCalls).toHaveLength(1);
  expect(failedToolCalls[0]).toMatchObject({
    provider_tool_call_id: "provider-schedule-recovery",
    tool_name: "schedule_post",
    status: "completed",
  });
  const failedCounts = await getStateCounts(page);
  expect(failedCounts.agentApprovalCheckpoints).toBe(1);
  expect(failedCounts.agentToolCalls).toBe(1);
  expect(failedCounts.scheduleJobs).toBe(0);
  expect(failedCounts.publishAttempts).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await installSuccessfulContinuationProvider(
    page,
    "Recovered provider continuation completed.",
  );
  await connectCustomProvider(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await openAgentRuntime(page);
  const recoverButton = page.getByRole("button", {
    name: "Recover continuation for agent run 1",
  });
  await expect(recoverButton).toBeVisible();
  await recoverButton.click();

  await expect(getBadge(page, "Completed").first()).toBeVisible();
  expect((await getAgentRuns(page))[0]).toMatchObject({
    status: "completed",
    output_summary: "Recovered provider continuation completed.",
  });
  const recoveredCounts = await getStateCounts(page);
  expect(recoveredCounts.agentApprovalCheckpoints).toBe(0);
  expect(recoveredCounts.agentToolCalls).toBe(1);
  expect(recoveredCounts.scheduleJobs).toBe(0);
  expect(recoveredCounts.publishAttempts).toBe(0);
  const recoveredToolCalls = await getAgentToolCalls(page);
  expect(recoveredToolCalls).toHaveLength(1);
  expect(recoveredToolCalls[0]).toMatchObject({
    id: failedToolCalls[0]?.id,
    provider_tool_call_id: "provider-schedule-recovery",
    tool_name: "schedule_post",
    status: "completed",
  });
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
  expect(await getContinuationSettlementInvokeCount(page)).toBe(2);
});

test("resume rejects unapproved, mismatched, and missing approvals without publishing", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createDryRun(page, "scheduler");
  await page.getByRole("button", { name: "Start Dry run" }).click();
  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();

  expect(await resumeRunThroughTestApi(page, 1)).toBe(
    "Linked approval must be approved before resume",
  );
  await executeSql(page, {
    query: "UPDATE approvals SET status = $1 WHERE id = $2",
    values: ["changes_requested", 1],
  });
  expect(await resumeRunThroughTestApi(page, 1)).toBe(
    "Linked approval must be approved before resume",
  );
  await executeSql(page, {
    query: "UPDATE approvals SET status = $1 WHERE id = $2",
    values: ["approved", 1],
  });
  await executeSql(page, {
    query: "UPDATE approvals SET campaign_id = $1 WHERE id = $2",
    values: [2, 1],
  });
  expect(await resumeRunThroughTestApi(page, 1)).toBe(
    "Linked approval belongs to a different campaign",
  );
  await executeSql(page, {
    query: "DELETE FROM approvals WHERE id = $1",
    values: [1],
  });
  expect(await resumeRunThroughTestApi(page, 1)).toBe(
    "Agent approval checkpoint was not found",
  );

  const counts = await getStateCounts(page);
  expect(counts.scheduleJobs).toBe(0);
  expect(counts.publishAttempts).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
});

test("double resume handles the approved tool once and keeps one history row", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await seedApproval(page);
  await openAgentRuntime(page);
  await createDryRun(page, "scheduler");
  await page.getByRole("button", { name: "Start Dry run" }).click();
  await openApprovals(page);
  await page.getByRole("button", { name: "Approve" }).click();

  const outcomes = await page.evaluate(async () => {
    const resume = (
      window as unknown as {
        __LINKGO_AGENT_RUNTIME_TEST_API__?: {
          resumeAgentRun: (input: { id: number }) => Promise<void>;
        };
      }
    ).__LINKGO_AGENT_RUNTIME_TEST_API__?.resumeAgentRun;
    if (!resume) throw new Error("Agent runtime test API was not initialized");
    return Promise.allSettled([resume({ id: 1 }), resume({ id: 1 })]);
  });
  expect(
    outcomes.filter((outcome) => outcome.status === "fulfilled"),
  ).toHaveLength(1);
  const rejected = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  );
  expect(rejected).toHaveLength(1);
  expect(String(rejected[0]?.reason)).toContain(
    "Agent continuation is already running",
  );
  expect(await resumeRunThroughTestApi(page, 1)).toBe(
    "Agent approval checkpoint was not found",
  );
  expect(await getAgentToolCalls(page)).toHaveLength(1);
  expect((await getAgentToolCalls(page))[0]?.status).toBe("completed");
  expect((await getStateCounts(page)).agentApprovalCheckpoints).toBe(0);
});

test("blocks archived campaign agent runtime mutations", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openAgentRuntime(page);
  await createDryRun(page);
  await archiveSelectedCampaign(page);
  await openAgentRuntime(page);

  await expect(
    page.getByText("Archived campaigns keep agent runtime history visible"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create run" }).first(),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Start Dry run" }),
  ).toBeHidden();

  await page.waitForFunction(
    () => "__LINKGO_AGENT_RUNTIME_TEST_API__" in window,
  );
  const result = await page.evaluate(async () => {
    const agentRuntimeTestApi = (
      window as unknown as {
        __LINKGO_AGENT_RUNTIME_TEST_API__?: {
          createAgentRun: (input: {
            campaignId: number;
            agentRole: "researcher";
          }) => Promise<number>;
        };
      }
    ).__LINKGO_AGENT_RUNTIME_TEST_API__;

    if (agentRuntimeTestApi === undefined) {
      return {
        ok: false,
        message: "Agent runtime test API was not initialized",
      };
    }

    try {
      await agentRuntimeTestApi.createAgentRun({
        campaignId: 1,
        agentRole: "researcher",
      });
      return { ok: true, message: "" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  expect(result).toEqual({ ok: false, message: "Campaign is archived" });
});

test("mock SQLite rejects invalid agent run playbook keys and keeps empty valid", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    executeSql(page, {
      query: `INSERT INTO agent_runs (
        campaign_id,
        workflow_run_id,
        workflow_step_id,
        agent_role,
        provider_key,
        model_name,
        playbook_key,
        status,
        input_summary,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, datetime('now'))`,
      values: [
        1,
        null,
        null,
        "researcher",
        "dry_run",
        "dry-run-local",
        "",
        "No playbook",
      ],
    }),
  ).resolves.toMatchObject({ rowsAffected: 1 });

  await expect(
    executeSql(page, {
      query: `INSERT INTO agent_runs (
        campaign_id,
        workflow_run_id,
        workflow_step_id,
        agent_role,
        provider_key,
        model_name,
        playbook_key,
        status,
        input_summary,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, datetime('now'))`,
      values: [
        1,
        null,
        null,
        "researcher",
        "dry_run",
        "dry-run-local",
        "bad_playbook",
        "Invalid playbook",
      ],
    }),
  ).rejects.toThrow("CHECK constraint failed: playbook_key");
});

function getBadge(page: Page, label: string): Locator {
  return page
    .locator("span")
    .filter({ hasText: new RegExp(`^${label}$`, "u") });
}

function getToolCard(page: Page, toolName: string): Locator {
  return page
    .getByText(toolName, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");
}

async function getStateCounts(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const counter = (
      window as unknown as {
        __LINKGO_SQL_STATE_COUNTS__?: () => Record<string, number>;
      }
    ).__LINKGO_SQL_STATE_COUNTS__;
    if (counter === undefined) throw new Error("SQL state counts unavailable");
    return counter();
  });
}

async function getAgentRuns(page: Page): Promise<
  Array<{
    status: string;
    error_message: string;
    playbook_key: string;
    iteration_count: number;
    output_summary: string;
  }>
> {
  return page.evaluate(() => {
    const getRuns = (
      window as unknown as {
        __LINKGO_SQL_AGENT_RUNS__?: () => Array<{
          status: string;
          error_message: string;
          playbook_key: string;
          iteration_count: number;
          output_summary: string;
        }>;
      }
    ).__LINKGO_SQL_AGENT_RUNS__;
    if (getRuns === undefined) {
      throw new Error("SQL agent runs unavailable");
    }
    return getRuns();
  });
}

async function getAgentToolCalls(page: Page): Promise<
  Array<{
    id: number;
    provider_tool_call_id: string;
    tool_name: string;
    status: string;
    input_json: string;
    output_json: string;
  }>
> {
  return page.evaluate(() => {
    const getToolCalls = (
      window as unknown as {
        __LINKGO_SQL_AGENT_TOOL_CALLS__?: () => Array<{
          id: number;
          provider_tool_call_id: string;
          tool_name: string;
          status: string;
          input_json: string;
          output_json: string;
        }>;
      }
    ).__LINKGO_SQL_AGENT_TOOL_CALLS__;
    if (getToolCalls === undefined) {
      throw new Error("SQL agent tool calls unavailable");
    }
    return getToolCalls();
  });
}

async function getAgentApprovalCheckpoint(page: Page): Promise<{
  agent_run_id: number;
  pending_tool_call_id: number;
  approval_id: number;
  phase: string;
  messages_json: string;
}> {
  return page.evaluate(() => {
    const getCheckpoints = (
      window as unknown as {
        __LINKGO_SQL_AGENT_APPROVAL_CHECKPOINTS__?: () => Array<{
          agent_run_id: number;
          pending_tool_call_id: number;
          approval_id: number;
          phase: string;
          messages_json: string;
        }>;
      }
    ).__LINKGO_SQL_AGENT_APPROVAL_CHECKPOINTS__;
    const checkpoint = getCheckpoints?.()[0];
    if (checkpoint === undefined) {
      throw new Error("Agent approval checkpoint unavailable");
    }
    return checkpoint;
  });
}

async function executeSql(
  page: Page,
  args: { query: string; values: unknown[] },
): Promise<unknown> {
  return page.evaluate((sqlArgs) => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    if (internals === undefined) throw new Error("Tauri mocks unavailable");
    return internals
      .invoke("__linkgo_test_sql|execute", sqlArgs)
      .then((result) => {
        if (!Array.isArray(result)) return result;
        return { rowsAffected: result[0], lastInsertId: result[1] };
      });
  }, args);
}

async function getLinkedInPublishInvokeCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number(
      (
        window as unknown as {
          __LINKGO_LINKEDIN_PUBLISH_INVOKES__?: number;
        }
      ).__LINKGO_LINKEDIN_PUBLISH_INVOKES__ ?? 0,
    ),
  );
}

async function getContinuationSettlementInvokeCount(
  page: Page,
): Promise<number> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __LINKGO_AGENT_CONTINUATION_SETTLEMENT_COUNT__?: () => number;
        }
      ).__LINKGO_AGENT_CONTINUATION_SETTLEMENT_COUNT__?.() ?? 0,
  );
}

async function resumeRunThroughTestApi(
  page: Page,
  id: number,
): Promise<string> {
  return page.evaluate(async (runId) => {
    const resume = (
      window as unknown as {
        __LINKGO_AGENT_RUNTIME_TEST_API__?: {
          resumeAgentRun: (input: { id: number }) => Promise<void>;
        };
      }
    ).__LINKGO_AGENT_RUNTIME_TEST_API__?.resumeAgentRun;
    if (!resume) return "Agent runtime test API was not initialized";
    try {
      await resume({ id: runId });
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, id);
}

async function enableReloadPersistence(page: Page): Promise<void> {
  await page.evaluate(() => {
    const enable = (
      window as unknown as {
        __LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__?: () => void;
      }
    ).__LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__;
    if (!enable) throw new Error("Reload persistence API unavailable");
    enable();
  });
}

async function openApprovals(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Approvals/ }).click();
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
}

async function seedApproval(page: Page, fixtureId = 1): Promise<void> {
  await insertCandidateForScoring(page, fixtureId);
  await executeSql(page, {
    query:
      "INSERT INTO drafts (campaign_id, candidate_post_id, angle, notes, updated_at) VALUES ($1, $2, $3, $4, datetime('now'))",
    values: [1, fixtureId, "Schedule metadata", "Approval fixture"],
  });
  await executeSql(page, {
    query:
      "INSERT INTO draft_variants (draft_id, variant_number, hook, body, cta, hashtags, updated_at) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))",
    values: [
      fixtureId,
      1,
      "Durable approval checkpoint",
      "A local metadata-only scheduling request.",
      "Review before continuing.",
      "#ContentOps",
    ],
  });
  await executeSql(page, {
    query:
      "UPDATE draft_variants SET status = 'selected', updated_at = datetime('now') WHERE id = $1",
    values: [fixtureId],
  });
  await executeSql(page, {
    query:
      "UPDATE drafts SET status = 'ready_for_review', updated_at = datetime('now') WHERE id = $1",
    values: [fixtureId],
  });
  await seedApprovalReadiness(page, fixtureId);
  await executeSql(page, {
    query:
      "INSERT INTO approvals (campaign_id, draft_id, draft_variant_id, status, reviewer_notes, updated_at) VALUES ($1, $2, $3, 'needs_review', $4, datetime('now'))",
    values: [1, fixtureId, fixtureId, "Review agent schedule metadata."],
  });
}

async function seedApprovalReadiness(
  page: Page,
  draftVariantId: number,
): Promise<void> {
  await page.evaluate((variantId) => {
    const seed = (
      window as unknown as {
        __LINKGO_SQL_SEED_APPROVAL_READINESS__?: (variantId: number) => void;
      }
    ).__LINKGO_SQL_SEED_APPROVAL_READINESS__;
    if (seed === undefined)
      throw new Error("Approval readiness seed API unavailable");
    seed(variantId);
  }, draftVariantId);
}

async function openAgentRuntime(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Agent Runtime/ }).click();
  await expect(
    page.getByRole("heading", { name: "Agent Runtime", exact: true }),
  ).toBeVisible();
}

async function createCampaign(
  page: Page,
  name = "Founder-led growth",
): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Name").fill(name);
  await dialog
    .getByLabel("Product")
    .fill("A local-first LinkedIn operations cockpit");
  await dialog.getByLabel("Audience").fill("Solo founders and operators");
  await dialog.getByLabel("Voice").fill("Concrete, concise, practical");
  await dialog.getByLabel("Tone").fill("Helpful operator");
  await dialog
    .getByLabel("Manual keywords")
    .fill("LinkedIn growth, founder content");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function connectCustomProvider(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Integrations/ }).click();
  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("test-custom-api-key");
  await dialog
    .getByLabel("Base URL override (required)")
    .fill("https://custom.example.com/v1");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

async function signInOpenAiAccount(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Integrations/ }).click();
  const openAiCard = page
    .getByText("OpenAI", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await openAiCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "OpenAI connection" });
  await dialog.getByRole("button", { name: "Account sign-in" }).click();
  await dialog.getByLabel(/I understand the risk/).check();
  await dialog
    .getByRole("button", { name: "Sign in with OpenAI account" })
    .click();
  await page.evaluate(() =>
    (
      window as unknown as { __LINKGO_AUTH_LOOPBACK_DONE__: () => void }
    ).__LINKGO_AUTH_LOOPBACK_DONE__(),
  );
  await expect(dialog.getByText("Signed in with OpenAI account")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

async function setOpenAiSignInState(
  page: Page,
  state: "expired" | "reauth_required",
): Promise<void> {
  await page.evaluate((nextState) => {
    const hooks = window as unknown as {
      __LINKGO_AUTH_EXPIRE_SIGN_IN__: (key: string) => void;
      __LINKGO_AUTH_REQUIRE_REAUTH__: (key: string, error: string) => void;
    };
    if (nextState === "expired") hooks.__LINKGO_AUTH_EXPIRE_SIGN_IN__("openai");
    else
      hooks.__LINKGO_AUTH_REQUIRE_REAUTH__(
        "openai",
        "Sign-in expired or was revoked; reconnect this provider",
      );
  }, state);
}

async function installMixedApprovalTurnProvider(
  page: Page,
  approvalPosition: "first" | "second",
): Promise<void> {
  await page.evaluate((position) => {
    const approvalCall = {
      type: "tool_call",
      providerToolCallId: "provider-schedule-mixed",
      toolName: "schedule_post",
      input: {
        campaignId: 1,
        approvalId: 1,
        scheduledFor: "next business day 09:00",
        timezone: "local",
      },
    };
    const sideEffectCall = {
      type: "tool_call",
      providerToolCallId: "provider-research-mixed",
      toolName: "research_posts",
      input: {
        campaignId: 1,
        keywords: ["approval isolation"],
        maxPosts: 1,
        suggestions: [
          {
            kind: "keyword",
            title: "Must not persist",
            keyword: "must not persist",
            rationale: "This write proves whether preflight ran before tools.",
            sourceKeyword: "approval isolation",
            confidenceScore: 99,
          },
        ],
      },
    };
    const toolCalls =
      position === "first"
        ? [approvalCall, sideEffectCall]
        : [sideEffectCall, approvalCall];
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: () => unknown;
        };
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute: () => ({
        chunks: [
          ...toolCalls,
          { type: "done", outputSummary: "Mixed tool turn rejected." },
        ],
      }),
    };
  }, approvalPosition);
}

async function installScheduleApprovalProvider(
  page: Page,
  approvalId: number,
  providerToolCallId: string,
): Promise<void> {
  await page.evaluate(
    ({ nextApprovalId, nextProviderToolCallId }) => {
      (
        window as unknown as {
          __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
            execute: () => unknown;
          };
        }
      ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
        execute: () => ({
          chunks: [
            {
              type: "tool_call",
              providerToolCallId: nextProviderToolCallId,
              toolName: "schedule_post",
              input: {
                campaignId: 1,
                approvalId: nextApprovalId,
                scheduledFor: "next business day 09:00",
                timezone: "local",
              },
            },
            {
              type: "done",
              outputSummary: "Schedule metadata requires approval.",
            },
          ],
        }),
      };
    },
    {
      nextApprovalId: approvalId,
      nextProviderToolCallId: providerToolCallId,
    },
  );
}

async function installFailingContinuationProvider(
  page: Page,
  message: string,
): Promise<void> {
  await page.evaluate((errorMessage) => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: () => unknown;
        };
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute: () => {
        throw new Error(errorMessage);
      },
    };
  }, message);
}

async function installSuccessfulContinuationProvider(
  page: Page,
  outputSummary: string,
): Promise<void> {
  await page.evaluate((summary) => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: () => unknown;
        };
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute: () => ({
        chunks: [{ type: "done", outputSummary: summary }],
      }),
    };
  }, outputSummary);
}

async function createProviderRun(
  page: Page,
  providerKey: "openai" | "anthropic" | "gemini" | "custom",
  role: "researcher" | "scorer" | "drafter" | "scheduler" = "researcher",
  playbookKey = "",
): Promise<void> {
  await page.getByRole("button", { name: "Create run" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create agent run" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Agent role").selectOption(role);
  if (playbookKey)
    await dialog.getByLabel("Playbook").selectOption(playbookKey);
  await dialog.getByLabel("Provider").selectOption(providerKey);
  await dialog
    .getByLabel("Input summary")
    .fill("Validate provider-backed runtime credentials.");
  await dialog.getByRole("button", { name: "Create run" }).click();
  await expect(dialog).toBeHidden();
}

async function createDryRun(
  page: Page,
  role:
    | "researcher"
    | "scorer"
    | "drafter"
    | "auditor"
    | "scheduler" = "researcher",
  playbookKey = "",
  inputSummary = "Validate runtime contracts for this campaign.",
): Promise<void> {
  await page.getByRole("button", { name: "Create run" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create agent run" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Agent role").selectOption(role);
  if (playbookKey)
    await dialog.getByLabel("Playbook").selectOption(playbookKey);
  await dialog.getByLabel("Input summary").fill(inputSummary);
  await dialog.getByRole("button", { name: "Create run" }).click();
  await expect(dialog).toBeHidden();
}

async function insertCandidateForScoring(
  page: Page,
  fixtureId = 1,
): Promise<void> {
  const fixtureSuffix = fixtureId === 1 ? "" : `-${fixtureId}`;
  await executeSql(page, {
    query: `INSERT INTO target_posts (platform, url, normalized_url, author_name, author_profile_url, platform_resource_urn, posted_at, content, content_hash, updated_at) VALUES ('linkedin', $1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
    values: [
      `https://www.linkedin.com/posts/runtime-score${fixtureSuffix}/`,
      `https://www.linkedin.com/posts/runtime-score${fixtureSuffix}/`,
      "Runtime Author",
      "",
      `urn:li:activity:runtime-score${fixtureSuffix}`,
      null,
      "Runtime scorer candidate",
      `runtime-score-hash${fixtureSuffix}`,
    ],
  });
  await executeSql(page, {
    query: `INSERT INTO candidate_posts (campaign_id, target_post_id, source_keyword, relevance_score, score_reason, notes, updated_at) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
    values: [1, fixtureId, "founder content", null, "", ""],
  });
}

function getPlaybookCard(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
}

async function archiveSelectedCampaign(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive" }).first().click();
  await expect(getBadge(page, "Archived")).toBeVisible();
}
