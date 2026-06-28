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
});

test("starts a provider-backed run through a mocked GG AI stream", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_GG_AI_PROVIDER_TEST_API__?: {
          stream: (options: unknown) => AsyncIterable<unknown>;
        };
        __LINKGO_PROVIDER_STREAM_OPTIONS__?: unknown;
      }
    ).__LINKGO_GG_AI_PROVIDER_TEST_API__ = {
      async *stream(options: unknown): AsyncIterable<unknown> {
        (
          window as unknown as { __LINKGO_PROVIDER_STREAM_OPTIONS__?: unknown }
        ).__LINKGO_PROVIDER_STREAM_OPTIONS__ = options;
        yield { type: "text", text: "Provider stream started." };
        yield {
          type: "tool_call",
          providerToolCallId: "mock-provider-tool-call-1",
          toolName: "research_posts",
          input: {
            campaignId: 1,
            keywords: ["founder content"],
            maxPosts: 1,
          },
        };
        yield { type: "done", outputSummary: "Provider run completed." };
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

  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openAgentRuntime(page);
  await createProviderRun(page, "custom");

  await page.getByRole("button", { name: "Start Custom API" }).click();
  await expect(getBadge(page, "Completed").first()).toBeVisible();
  await expect(page.getByText("Provider run completed.").first()).toBeVisible();

  const runs = await getAgentRuns(page);
  const toolCalls = await getAgentToolCalls(page);
  expect(runs[0]?.status).toBe("completed");
  expect(toolCalls[0]?.provider_tool_call_id).toBe("mock-provider-tool-call-1");
  const streamOptions = await page.evaluate(
    () =>
      (
        window as unknown as { __LINKGO_PROVIDER_STREAM_OPTIONS__?: unknown }
      ).__LINKGO_PROVIDER_STREAM_OPTIONS__,
  );
  expect(streamOptions).toMatchObject({
    provider: "openai",
    model: "custom-model",
    apiKey: "sk-test-custom-key",
    baseUrl: "https://custom.example.com/v1",
  });
});

test("stops schedule dry-run at waiting approval without publishing", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
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

async function getAgentRuns(
  page: Page,
): Promise<Array<{ status: string; error_message: string }>> {
  return page.evaluate(() => {
    const getRuns = (
      window as unknown as {
        __LINKGO_SQL_AGENT_RUNS__?: () => Array<{
          status: string;
          error_message: string;
        }>;
      }
    ).__LINKGO_SQL_AGENT_RUNS__;
    if (getRuns === undefined) {
      throw new Error("SQL agent runs unavailable");
    }
    return getRuns();
  });
}

async function getAgentToolCalls(
  page: Page,
): Promise<Array<{ provider_tool_call_id: string }>> {
  return page.evaluate(() => {
    const getToolCalls = (
      window as unknown as {
        __LINKGO_SQL_AGENT_TOOL_CALLS__?: () => Array<{
          provider_tool_call_id: string;
        }>;
      }
    ).__LINKGO_SQL_AGENT_TOOL_CALLS__;
    if (getToolCalls === undefined) {
      throw new Error("SQL agent tool calls unavailable");
    }
    return getToolCalls();
  });
}

async function openAgentRuntime(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Agent Runtime/ }).click();
  await expect(
    page.getByRole("heading", { name: "Agent Runtime", exact: true }),
  ).toBeVisible();
}

async function createCampaign(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Name").fill("Founder-led growth");
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

async function createProviderRun(
  page: Page,
  providerKey: "openai" | "anthropic" | "gemini" | "custom",
): Promise<void> {
  await page.getByRole("button", { name: "Create run" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create agent run" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Provider").selectOption(providerKey);
  await dialog
    .getByLabel("Input summary")
    .fill("Validate provider-backed runtime credentials.");
  await dialog.getByRole("button", { name: "Create run" }).click();
  await expect(dialog).toBeHidden();
}

async function createDryRun(
  page: Page,
  role: "researcher" | "scheduler" = "researcher",
): Promise<void> {
  await page.getByRole("button", { name: "Create run" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create agent run" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Agent role").selectOption(role);
  await dialog
    .getByLabel("Input summary")
    .fill("Validate runtime contracts for this campaign.");
  await dialog.getByRole("button", { name: "Create run" }).click();
  await expect(dialog).toBeHidden();
}

async function archiveSelectedCampaign(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive" }).first().click();
  await expect(getBadge(page, "Archived")).toBeVisible();
}
