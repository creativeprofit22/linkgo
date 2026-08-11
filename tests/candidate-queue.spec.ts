import { expect, test, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("creates a campaign then adds and shows a candidate", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);

  await addCandidate(page);

  await expect(
    page.getByRole("heading", { name: "Jane Operator" }),
  ).toBeVisible();
  await expect(
    page.getByText("This founder post has a sharp ICP signal."),
  ).toBeVisible();
  await expect(
    page.getByText("Founder-led growth", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByText("founder content", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("87/100", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "https://www.linkedin.com/in/jane-operator/",
    }),
  ).toHaveAttribute("href", "https://www.linkedin.com/in/jane-operator/");
});

test("candidate intake fields expose schema max lengths", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);

  await page.getByRole("button", { name: "Add candidate" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Add candidate" }),
  ).toBeVisible();

  await expect(page.getByLabel("Source keyword")).toHaveAttribute(
    "maxlength",
    "80",
  );
  await expect(page.getByLabel("LinkedIn post URL")).toHaveAttribute(
    "maxlength",
    "1000",
  );
  await expect(page.getByLabel("Post text")).toHaveAttribute(
    "maxlength",
    "3000",
  );
  await expect(page.getByLabel("Author name")).toHaveAttribute(
    "maxlength",
    "160",
  );
  await expect(page.getByLabel("Author profile URL")).toHaveAttribute(
    "maxlength",
    "1000",
  );
  await expect(page.getByLabel("Posted at")).toHaveAttribute("maxlength", "80");
  await expect(page.getByLabel("Score reason")).toHaveAttribute(
    "maxlength",
    "500",
  );
  await expect(page.getByLabel("Notes")).toHaveAttribute("maxlength", "1000");
});

test("duplicate candidate add shows toast and keeps one candidate", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);

  await addCandidate(page);
  await addCandidate(page, { expectSuccess: false });

  await expect(page.getByText("Candidate was not added")).toBeVisible();
  await expect(
    page.getByText("Candidate already exists for this campaign"),
  ).toBeVisible();

  const candidateInsertCount = await page.evaluate(() => {
    const calls =
      (
        window as unknown as {
          __LINKGO_SQL_EXECUTE_CALLS__?: Array<{ query: string }>;
        }
      ).__LINKGO_SQL_EXECUTE_CALLS__ ?? [];
    return calls.filter((call) =>
      call.query.includes("INSERT INTO candidate_posts"),
    ).length;
  });

  expect(candidateInsertCount).toBe(1);
});

test("failed dedupe insert rolls back candidate intake", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);

  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_FAIL_DEDUPE_KEY_TYPE__?: string }
    ).__LINKGO_FAIL_DEDUPE_KEY_TYPE__ = "content_hash";
  });
  await addCandidate(page, { expectSuccess: false });

  await expect(page.getByText("Candidate was not added")).toBeVisible();
  await expect(page.getByText("Injected dedupe insert failure")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Jane Operator" }),
  ).toBeHidden();

  const stateCounts = await page.evaluate(() => {
    const getStateCounts = (
      window as unknown as {
        __LINKGO_SQL_STATE_COUNTS__?: () => {
          targetPosts: number;
          candidatePosts: number;
          dedupeKeys: number;
        };
      }
    ).__LINKGO_SQL_STATE_COUNTS__;
    const counts = getStateCounts?.();
    return counts === undefined
      ? undefined
      : {
          targetPosts: counts.targetPosts,
          candidatePosts: counts.candidatePosts,
          dedupeKeys: counts.dedupeKeys,
        };
  });
  const transactionCalls = await page.evaluate(() => {
    const calls =
      (
        window as unknown as {
          __LINKGO_SQL_EXECUTE_CALLS__?: Array<{ query: string }>;
        }
      ).__LINKGO_SQL_EXECUTE_CALLS__ ?? [];
    const normalized = calls.map((call) =>
      call.query.trim().toLocaleUpperCase(),
    );
    return normalized.slice(normalized.lastIndexOf("BEGIN TRANSACTION"));
  });

  expect(stateCounts).toEqual({
    targetPosts: 0,
    candidatePosts: 0,
    dedupeKeys: 0,
  });
  expect(transactionCalls).toContain("BEGIN TRANSACTION");
  expect(transactionCalls).toContain("ROLLBACK");
  expect(transactionCalls).not.toContain("COMMIT");
});

test("archived campaigns disable discovery and scoring actions", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await archiveCampaign(page, "Founder-led growth");
  await createCampaign(page, "Active funnel");
  await openQueue(page);

  await page
    .getByRole("combobox")
    .selectOption({ label: "Founder-led growth (archived)" });

  await expect(
    page.getByRole("button", { name: "Run discovery" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Score candidates" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add candidate" }),
  ).toBeDisabled();
});

test("keeps the latest campaign candidates when an earlier load resolves last", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Campaign A");
  await createCampaign(page, "Campaign B");
  await openQueue(page);

  const campaignSelector = page.getByRole("combobox");
  await campaignSelector.selectOption({ label: "Campaign A" });
  await addCandidate(page, {
    authorName: "Campaign A Candidate",
    urlSuffix: "campaign-a",
    content: "Candidate owned by campaign A.",
  });
  await campaignSelector.selectOption({ label: "Campaign B" });
  await addCandidate(page, {
    authorName: "Campaign B Candidate",
    urlSuffix: "campaign-b",
    content: "Candidate owned by campaign B.",
  });

  await page.evaluate(() => {
    const delayCampaignSelects = (
      window as unknown as {
        __LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__?: (campaignId: number) => void;
      }
    ).__LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__;
    delayCampaignSelects?.(1);
  });
  await campaignSelector.selectOption({ label: "Campaign A" });
  await page.waitForFunction(() => {
    const getPendingCount = (
      window as unknown as {
        __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__?: (
          campaignId: number,
        ) => number;
      }
    ).__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__;
    return (getPendingCount?.(1) ?? 0) > 0;
  });
  await campaignSelector.selectOption({ label: "Campaign B" });

  await expect(
    page.getByRole("heading", { name: "Campaign B Candidate" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const releaseCampaignSelects = (
      window as unknown as {
        __LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__?: (campaignId: number) => void;
      }
    ).__LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__;
    releaseCampaignSelects?.(1);
  });
  await page.waitForFunction(() => {
    const getPendingCount = (
      window as unknown as {
        __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__?: (
          campaignId: number,
        ) => number;
      }
    ).__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__;
    return (getPendingCount?.(1) ?? 0) === 0;
  });

  await expect(campaignSelector).toHaveValue("2");
  await expect(
    page.getByRole("heading", { name: "Campaign B Candidate" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Campaign A Candidate" }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Shortlist" }).click();
  const statuses = await page.evaluate(() => {
    const getCandidates = (
      window as unknown as {
        __LINKGO_SQL_CANDIDATE_POSTS__?: () => Array<{
          campaign_id: number;
          status: string;
        }>;
      }
    ).__LINKGO_SQL_CANDIDATE_POSTS__;
    return (getCandidates?.() ?? [])
      .map(({ campaign_id, status }) => ({ campaign_id, status }))
      .sort((left, right) => left.campaign_id - right.campaign_id);
  });
  expect(statuses).toEqual([
    { campaign_id: 1, status: "new" },
    { campaign_id: 2, status: "shortlisted" },
  ]);
});

test("candidate status actions move through triage states", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);

  await page.getByRole("button", { name: "Shortlist" }).click();
  await expect(
    page.getByText("Shortlisted", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reject" }).click();
  await expect(
    page.getByText("Rejected", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Mark drafted" }).click();
  await expect(
    page.getByText("Drafted", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reset to new" }).click();
  await expect(page.getByText("New", { exact: true }).first()).toBeVisible();
});

test("candidate deletion requires confirmation", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);

  page.on("dialog", async (dialog) => {
    expect(dialog.message()).toBe(
      "Delete this candidate? This cannot be undone.",
    );
    await dialog.accept();
  });

  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Jane Operator" }),
  ).toBeHidden();
});

test("linked draft deletion blocks its workflow and rolls back atomically", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);

  const fixture = await page.evaluate(() => {
    const mockWindow = window as unknown as {
      __LINKGO_SQL_SEED_LINKED_DRAFT_CANDIDATE_DELETE__: () => {
        candidateId: number;
        requestId: number;
        workflowRunId: number;
        workflowStepId: number;
      };
    };
    return mockWindow.__LINKGO_SQL_SEED_LINKED_DRAFT_CANDIDATE_DELETE__();
  });
  const readState = async () =>
    page.evaluate((ids) => {
      const mockWindow = window as unknown as {
        __LINKGO_SQL_CANDIDATE_POSTS__: () => Array<{ id: number }>;
        __LINKGO_SQL_DRAFT_GENERATION_REQUESTS__: () => Array<{
          id: number;
          status: string;
          error_message: string;
        }>;
        __LINKGO_SQL_WORKFLOW_RUNS__: () => Array<{
          id: number;
          status: string;
          current_step_key: string;
        }>;
        __LINKGO_SQL_WORKFLOW_STEPS__: () => Array<{
          id: number;
          status: string;
          output_summary: string;
          error_message: string;
        }>;
        __LINKGO_SQL_WORKFLOW_EVENTS__: () => Array<{
          workflow_run_id: number;
          workflow_step_id: number | null;
          event_type: string;
          summary: string;
        }>;
        __LINKGO_SQL_WORKFLOW_ARTIFACTS__: () => Array<{
          workflow_run_id: number;
          artifact_type: string;
          artifact_id: number;
          summary: string;
        }>;
      };
      return {
        candidate: mockWindow
          .__LINKGO_SQL_CANDIDATE_POSTS__()
          .find((row) => row.id === ids.candidateId),
        request: mockWindow
          .__LINKGO_SQL_DRAFT_GENERATION_REQUESTS__()
          .find((row) => row.id === ids.requestId),
        run: mockWindow
          .__LINKGO_SQL_WORKFLOW_RUNS__()
          .find((row) => row.id === ids.workflowRunId),
        step: mockWindow
          .__LINKGO_SQL_WORKFLOW_STEPS__()
          .find((row) => row.id === ids.workflowStepId),
        events: mockWindow
          .__LINKGO_SQL_WORKFLOW_EVENTS__()
          .filter((row) => row.workflow_run_id === ids.workflowRunId),
        artifact: mockWindow
          .__LINKGO_SQL_WORKFLOW_ARTIFACTS__()
          .find(
            (row) =>
              row.workflow_run_id === ids.workflowRunId &&
              row.artifact_type === "candidate_post" &&
              row.artifact_id === ids.candidateId,
          ),
      };
    }, fixture);

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_FAIL_CANDIDATE_DELETE_WORKFLOW_EVENT__?: boolean;
      }
    ).__LINKGO_FAIL_CANDIDATE_DELETE_WORKFLOW_EVENT__ = true;
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText("Candidate was not deleted")).toBeVisible();
  await expect(
    page.getByText("Injected candidate deletion workflow event failure"),
  ).toBeVisible();
  const rolledBack = await readState();
  expect(rolledBack.candidate).toBeDefined();
  expect(rolledBack.request).toMatchObject({ status: "generated" });
  expect(rolledBack.run).toMatchObject({
    status: "running",
    current_step_key: "draft",
  });
  expect(rolledBack.step).toMatchObject({
    status: "running",
    output_summary: "Waiting for operator to save generated variants",
    error_message: "",
  });
  expect(rolledBack.events).toHaveLength(0);
  expect(rolledBack.artifact).toBeDefined();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Jane Operator" }),
  ).toBeHidden();

  const deleted = await readState();
  expect(deleted.candidate).toBeUndefined();
  expect(deleted.request).toBeUndefined();
  expect(deleted.run).toMatchObject({
    status: "blocked",
    current_step_key: "draft",
  });
  expect(deleted.step).toMatchObject({
    status: "blocked",
    output_summary: "",
  });
  expect(deleted.step?.error_message).toContain(
    `Candidate #${fixture.candidateId} was deleted`,
  );
  expect(deleted.events).toContainEqual(
    expect.objectContaining({
      workflow_step_id: fixture.workflowStepId,
      event_type: "step_blocked",
      summary: expect.stringContaining(
        `Candidate #${fixture.candidateId} was deleted`,
      ),
    }),
  );
  expect(deleted.artifact).toMatchObject({
    artifact_id: fixture.candidateId,
    summary: `Candidate #${fixture.candidateId} selected for drafting`,
  });
});

test("queue renders no-campaign empty state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openQueue(page);

  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();
  await expect(
    page.getByText("No campaigns yet", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Open Campaigns first")).toBeVisible();
});

test("discovery blocks seed keywords over schema max length", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);

  await page.getByRole("button", { name: "Run discovery" }).click();
  const dialog = page.getByRole("dialog", { name: "Run discovery" });
  await page.getByLabel("Seed keywords").fill("a".repeat(81));
  await dialog.getByRole("button", { name: "Run discovery" }).click();

  await expect(dialog).toBeVisible();
  await expect(
    page.getByText("Seed keywords must be 80 characters or fewer."),
  ).toBeVisible();
  const agentRunInsertCount = await page.evaluate(() => {
    const calls =
      (
        window as unknown as {
          __LINKGO_SQL_EXECUTE_CALLS__?: Array<{ query: string }>;
        }
      ).__LINKGO_SQL_EXECUTE_CALLS__ ?? [];
    return calls.filter((call) => call.query.includes("INSERT INTO agent_runs"))
      .length;
  });

  expect(agentRunInsertCount).toBe(0);
});

test("dry-run discovery creates, promotes, and dismisses suggestions", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);

  await page.getByRole("button", { name: "Run discovery" }).click();
  await page
    .getByRole("dialog", { name: "Run discovery" })
    .getByRole("button", { name: "Run discovery" })
    .click();

  await expect(
    page.getByText("founder-led content", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Operator-led AI workflow proof", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Promote keyword" }).first().click();
  await expect(page.getByText("Promoted", { exact: true })).toBeVisible();

  const generatedKeywordCount = await page.evaluate(() => {
    const getKeywords = (
      window as unknown as {
        __LINKGO_SQL_KEYWORDS__?: () => Array<{ source: string }>;
      }
    ).__LINKGO_SQL_KEYWORDS__;
    return (
      getKeywords?.().filter((keyword) => keyword.source === "generated")
        .length ?? 0
    );
  });
  expect(generatedKeywordCount).toBe(1);

  await page
    .getByText("founder-led content", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]")
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(
    page.getByText("founder-led content", { exact: true }),
  ).toBeHidden();
});

test("failed discovery promotion rolls back generated keyword", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);

  await page.getByRole("button", { name: "Run discovery" }).click();
  await page
    .getByRole("dialog", { name: "Run discovery" })
    .getByRole("button", { name: "Run discovery" })
    .click();

  await expect(
    page.getByText("founder-led content", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_FAIL_DISCOVERY_STATUS_UPDATE__?: boolean }
    ).__LINKGO_FAIL_DISCOVERY_STATUS_UPDATE__ = true;
  });
  await page.getByRole("button", { name: "Promote keyword" }).first().click();

  await expect(page.getByText("Suggestion was not promoted")).toBeVisible();
  await expect(
    page.getByText("Injected discovery status update failure"),
  ).toBeVisible();

  const rollbackState = await page.evaluate(() => {
    const getKeywords = (
      window as unknown as {
        __LINKGO_SQL_KEYWORDS__?: () => Array<{ source: string }>;
      }
    ).__LINKGO_SQL_KEYWORDS__;
    const getDiscoveryItems = (
      window as unknown as {
        __LINKGO_SQL_CANDIDATE_DISCOVERY_ITEMS__?: () => Array<{
          keyword: string;
          status: string;
        }>;
      }
    ).__LINKGO_SQL_CANDIDATE_DISCOVERY_ITEMS__;
    const calls =
      (
        window as unknown as {
          __LINKGO_SQL_EXECUTE_CALLS__?: Array<{ query: string }>;
        }
      ).__LINKGO_SQL_EXECUTE_CALLS__ ?? [];
    const transactionCalls = calls.map((call) =>
      call.query.trim().toLocaleUpperCase(),
    );
    const promotionTransactionCalls = transactionCalls.slice(
      transactionCalls.lastIndexOf("BEGIN TRANSACTION"),
    );
    return {
      generatedKeywords:
        getKeywords?.().filter((keyword) => keyword.source === "generated")
          .length ?? 0,
      founderLedStatus: getDiscoveryItems?.().find(
        (item) => item.keyword === "founder-led content",
      )?.status,
      promotionTransactionCalls,
    };
  });

  expect(rollbackState.generatedKeywords).toBe(0);
  expect(rollbackState.founderLedStatus).toBe("suggested");
  expect(rollbackState.promotionTransactionCalls).toContain(
    "BEGIN TRANSACTION",
  );
  expect(rollbackState.promotionTransactionCalls).toContain("ROLLBACK");
  expect(rollbackState.promotionTransactionCalls).not.toContain("COMMIT");
});

test("dry-run scoring applies rationale and can auto-reject new low scores", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page, {
    score: null,
    urlSuffix: "one",
    content: "First unscored candidate.",
  });
  await addCandidate(page, {
    score: null,
    urlSuffix: "two",
    content: "Second unscored candidate.",
  });

  await page.getByRole("button", { name: "Score candidates" }).click();
  await page.getByLabel("Reject new candidates below minimum score").check();
  await page
    .getByRole("dialog", { name: "Score candidates" })
    .getByRole("button", { name: "Score candidates" })
    .click();

  await expect(
    page.getByText("Dry-run score: strong campaign fit"),
  ).toBeVisible();
  await expect(page.getByText("78/100", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Rejected", { exact: true }).first(),
  ).toBeVisible();
});
async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();
}

async function createCampaign(
  page: Page,
  name = "Founder-led growth",
): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "New campaign" }),
  ).toBeVisible();

  await page.getByLabel("Name").fill(name);
  await page
    .getByLabel("Product")
    .fill("A local-first LinkedIn operations cockpit");
  await page
    .getByLabel("Audience")
    .fill("Solo founders and technical operators");
  await page.getByLabel("Voice").fill("Concrete, concise, practical");
  await page.getByLabel("Tone").fill("Helpful operator");
  await page
    .getByLabel("Manual keywords")
    .fill("LinkedIn growth, founder content, outbound");
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function archiveCampaign(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Open ${name} actions` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
}

async function addCandidate(
  page: Page,
  options: {
    expectSuccess?: boolean;
    score?: string | null;
    urlSuffix?: string;
    content?: string;
    authorName?: string;
  } = { expectSuccess: true, score: "87" },
): Promise<void> {
  await page.getByRole("button", { name: "Add candidate" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Add candidate" }),
  ).toBeVisible();

  await page
    .getByLabel("LinkedIn post URL")
    .fill(
      `https://www.linkedin.com/posts/example-activity-${options.urlSuffix ?? "123"}/`,
    );
  await page
    .getByLabel("Post text")
    .fill(options.content ?? "This founder post has a sharp ICP signal.");
  await page
    .getByLabel("Author name")
    .fill(options.authorName ?? "Jane Operator");
  await page
    .getByLabel("Author profile URL")
    .fill("https://www.linkedin.com/in/jane-operator/");
  await page.getByLabel("Posted at").fill("2026-06-25");
  await page.getByLabel("Source keyword").fill("founder content");
  if (options.score !== null) {
    await page.getByLabel("Relevance score").fill(options.score ?? "87");
    await page.getByLabel("Score reason").fill("Strong audience overlap.");
  }
  await page.getByLabel("Notes").fill("Good comment opportunity.");
  const dialog = page.getByRole("dialog", { name: "Add candidate" });
  await dialog.getByRole("button", { name: "Add candidate" }).click();
  if (options.expectSuccess ?? true) await expect(dialog).toBeHidden();
}
