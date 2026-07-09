import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

test("creates and starts a workflow run", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openWorkflows(page);

  await createWorkflowRun(page);

  await expect(
    page.getByRole("heading", {
      name: "Weekly founder content pipeline",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Run created:/u)).toBeVisible();
  await expect(getStepCard(page, "Research")).toBeVisible();
  await expect(getStepCard(page, "Score relevance")).toBeVisible();
  await expect(getStepCard(page, "Draft variants")).toBeVisible();
  await expect(getStepCard(page, "Audit drafts")).toBeVisible();
  await expect(getStepCard(page, "Approve")).toBeVisible();
  await expect(getStepCard(page, "Schedule")).toBeVisible();
  await expect(getStepCard(page, "Measure")).toBeVisible();

  await page.getByRole("button", { name: "Start run" }).click();

  await expect(getBadge(page, "Running").first()).toBeVisible();
  await expect(
    getStepCard(page, "Research").getByText("Running"),
  ).toBeVisible();
});

test("shows executor-created agent run artifact chips", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openWorkflows(page);
  await createWorkflowRun(page);

  await page.getByRole("button", { name: "Run executor" }).click();

  await expect(page.getByLabel("Workflow artifacts")).toContainText(
    /Agent run #\d+ · researcher · completed/u,
  );
  await expect(page.getByText("Research completed")).toBeVisible();
});

test("updates duplicate executor-created agent run artifacts in place", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openWorkflows(page);
  await createWorkflowRun(page);

  await page.getByRole("button", { name: "Run executor" }).click();

  const artifactChip = page
    .getByLabel("Workflow artifacts")
    .locator("span")
    .filter({ hasText: /Agent run #\d+/u });
  await expect(artifactChip).toHaveCount(1);
  await page.waitForFunction(
    () =>
      "__LINKGO_WORKFLOWS_TEST_API__" in window &&
      "__LINKGO_SQL_WORKFLOW_ARTIFACTS__" in window,
  );

  const result = await page.evaluate(async () => {
    type WorkflowArtifact = {
      id: number;
      workflow_run_id: number;
      workflow_step_id: number | null;
      artifact_type: "agent_run";
      artifact_id: number;
      summary: string;
    };
    type DuplicateResult =
      | {
          ok: true;
          initialId: number;
          firstId: number;
          secondId: number;
          artifactCount: number;
          artifactIds: number[];
          summary: string;
        }
      | { ok: false; message: string };

    const testWindow = window as unknown as {
      __LINKGO_WORKFLOWS_TEST_API__?: {
        createWorkflowArtifact: (input: {
          workflowRunId: number;
          workflowStepId?: number;
          artifactType: "agent_run";
          artifactId: number;
          summary?: string;
        }) => Promise<number>;
      };
      __LINKGO_SQL_WORKFLOW_ARTIFACTS__?: () => WorkflowArtifact[];
    };
    const api = testWindow.__LINKGO_WORKFLOWS_TEST_API__;
    const readArtifacts = testWindow.__LINKGO_SQL_WORKFLOW_ARTIFACTS__;
    const artifact = readArtifacts?.()[0];
    if (api === undefined || readArtifacts === undefined) {
      return { ok: false, message: "Workflow artifact test API missing" };
    }
    if (artifact === undefined) {
      return { ok: false, message: "Initial workflow artifact missing" };
    }

    const input = {
      workflowRunId: artifact.workflow_run_id,
      workflowStepId: artifact.workflow_step_id ?? undefined,
      artifactType: artifact.artifact_type,
      artifactId: artifact.artifact_id,
    };
    const firstId = await api.createWorkflowArtifact({
      ...input,
      summary: "Duplicate relink one",
    });
    const secondId = await api.createWorkflowArtifact({
      ...input,
      summary: "Duplicate relink two",
    });
    const artifacts = readArtifacts();
    return {
      ok: true,
      initialId: artifact.id,
      firstId,
      secondId,
      artifactCount: artifacts.length,
      artifactIds: artifacts.map((row) => row.id),
      summary: artifacts[0]?.summary ?? "",
    } satisfies DuplicateResult;
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  expect(result.firstId).toBe(result.initialId);
  expect(result.secondId).toBe(result.initialId);
  expect(result.artifactCount).toBe(1);
  expect(result.artifactIds).toEqual([result.initialId]);
  expect(result.summary).toBe("Duplicate relink two");

  await openCampaigns(page);
  await openWorkflows(page);

  await expect(artifactChip).toHaveCount(1);
  await expect(artifactChip).toContainText(
    /Agent run #\d+ · researcher · completed/u,
  );
});

test("keeps whitespace-only workflow titles client-side disabled", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openWorkflows(page);

  await page
    .getByRole("button", { name: "Create workflow run" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Create workflow run" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Title").fill("   ");

  await expect(
    dialog.getByRole("button", { name: "Create workflow run" }),
  ).toBeDisabled();
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/Run created:/u)).toBeHidden();
});

test("advances steps and records progress events", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openWorkflows(page);
  await createWorkflowRun(page);
  await page.getByRole("button", { name: "Start run" }).click();

  await updateStepStatus(
    page,
    "Research",
    "Complete",
    "Research sources captured for drafting.",
  );

  await expect(
    getStepCard(page, "Research").getByText("Completed"),
  ).toBeVisible();
  await expect(
    getStepCard(page, "Research").getByText(
      "Research sources captured for drafting.",
    ),
  ).toBeVisible();
  await expect(
    getStepCard(page, "Score relevance").getByText("Running"),
  ).toBeVisible();
  await expect(page.getByText("1/7 steps complete")).toBeVisible();
  await expect(page.getByText("Research completed")).toBeVisible();

  await getStepCard(page, "Score relevance")
    .getByRole("button", { name: "Wait approval" })
    .click();

  await expect(getBadge(page, "Waiting approval").first()).toBeVisible();
  await expect(
    page.getByText("Score relevance waiting for approval"),
  ).toBeVisible();
});

test("persists manual step error context after refetch", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openWorkflows(page);
  await createWorkflowRun(page);
  await page.getByRole("button", { name: "Start run" }).click();

  const reason = "Research source quota blocked the manual workflow.";
  await updateStepStatus(page, "Research", "Block", reason);

  await expect(
    getStepCard(page, "Research").getByText("Blocked", { exact: true }),
  ).toBeVisible();
  await expect(getStepCard(page, "Research").getByText(reason)).toBeVisible();

  await openCampaigns(page);
  await openWorkflows(page);

  await expect(getStepCard(page, "Research").getByText(reason)).toBeVisible();
});

test("hides step mutations after cancelling a workflow run", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openWorkflows(page);
  await createWorkflowRun(page);
  await page.getByRole("button", { name: "Start run" }).click();

  const researchCard = getStepCard(page, "Research");
  const scoreCard = getStepCard(page, "Score relevance");
  await expect(
    researchCard.getByRole("button", { name: "Complete" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cancel run" }).click();

  await expect(getBadge(page, "Cancelled").first()).toBeVisible();
  await expect(page.getByText("Workflow run cancelled")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel run" })).toBeHidden();

  for (const label of [
    "Complete",
    "Wait approval",
    "Block",
    "Fail",
    "Skip",
  ] as const) {
    await expect(
      researchCard.getByRole("button", { name: label, exact: true }),
    ).toBeHidden();
  }
  for (const label of ["Start", "Skip"] as const) {
    await expect(
      scoreCard.getByRole("button", { name: label, exact: true }),
    ).toBeHidden();
  }
});

test("blocks archived campaign mutations", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openWorkflows(page);
  await createWorkflowRun(page);
  await archiveSelectedCampaign(page);
  await openWorkflows(page);

  await expect(
    page.getByText("Archived campaigns keep workflow history visible"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create workflow run" }).first(),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Start run" })).toBeHidden();
  await expect(
    getStepCard(page, "Research").getByRole("button", { name: "Start" }),
  ).toBeHidden();

  await page.waitForFunction(() => "__LINKGO_WORKFLOWS_TEST_API__" in window);
  const result = await page.evaluate(async () => {
    const workflowsTestApi = (
      window as unknown as {
        __LINKGO_WORKFLOWS_TEST_API__?: {
          createWorkflowRun: (input: {
            campaignId: number;
            title: string;
          }) => Promise<number>;
        };
      }
    ).__LINKGO_WORKFLOWS_TEST_API__;

    if (workflowsTestApi === undefined) {
      return { ok: false, message: "Workflows test API was not initialized" };
    }

    try {
      await workflowsTestApi.createWorkflowRun({
        campaignId: 1,
        title: "Should fail for archived campaigns",
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

function getStepCard(page: Page, title: string): Locator {
  return page
    .getByRole("heading", { name: title, exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'rounded-xl')][1]");
}

async function updateStepStatus(
  page: Page,
  stepTitle: string,
  actionLabel: string,
  contextText: string,
): Promise<void> {
  await getStepCard(page, stepTitle)
    .getByRole("button", { name: actionLabel, exact: true })
    .click();

  const dialog = page.getByRole("dialog", { name: `Update ${stepTitle}` });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel(
      actionLabel === "Block" || actionLabel === "Fail"
        ? "Error message"
        : "Output summary",
    )
    .fill(contextText);
  await dialog
    .getByRole("button", { name: `Save ${actionLabel.toLowerCase()}` })
    .click();
  await expect(dialog).toBeHidden();
}

async function openWorkflows(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Workflows/ }).click();
  await expect(
    page.getByRole("heading", { name: "Workflows", exact: true }),
  ).toBeVisible();
}

async function openCampaigns(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
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

async function createWorkflowRun(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Create workflow run" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Create workflow run" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Title").fill("Weekly founder content pipeline");
  await dialog
    .getByLabel("Context summary")
    .fill("Manual durable workflow test context.");
  await dialog.getByRole("button", { name: "Create workflow run" }).click();
  await expect(dialog).toBeHidden();
}

async function archiveSelectedCampaign(page: Page): Promise<void> {
  await openCampaigns(page);
  await page.getByRole("button", { name: "Archive" }).first().click();
  await expect(getBadge(page, "Archived")).toBeVisible();
}
