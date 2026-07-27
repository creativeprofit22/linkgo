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

test("reconciles workflow-linked schedule approval continuation and stale resume", async ({
  page,
}) => {
  await prepareWorkflowLinkedScheduleAgent(page);

  await openApprovals(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await resumeAgentRun(page, 1);

  let trace = await getWorkflowTraceState(page);
  expect(
    trace.steps.find((step) => step.step_key === "schedule"),
  ).toMatchObject({
    status: "completed",
    error_message: "",
  });
  expect(trace.steps.find((step) => step.step_key === "measure")?.status).toBe(
    "running",
  );
  expect(trace.executions).toHaveLength(1);
  expect(trace.executions[0]).toMatchObject({
    agent_run_id: 1,
    status: "completed",
    error_summary: "",
  });

  await setWorkflowStepState(page, 6, "waiting_approval");
  await setWorkflowStepState(page, 7, "pending");
  await executeSql(page, {
    query: `UPDATE workflow_step_executions
      SET agent_run_id = COALESCE($1, agent_run_id), status = $2, error_summary = $3, updated_at = datetime('now')
      WHERE id = $4`,
    values: [1, "waiting_approval", "", 1],
  });
  await executeSql(page, {
    query: `UPDATE workflow_runs
      SET status = $1, current_step_key = $2, updated_at = datetime('now')
      WHERE id = $3`,
    values: ["waiting_approval", "schedule", 1],
  });
  await resumeWorkflowRun(page, 1);

  trace = await getWorkflowTraceState(page);
  expect(trace.runs[0]).toMatchObject({
    status: "completed",
    current_step_key: "measure",
  });
  expect(
    trace.steps.filter((step) =>
      ["schedule", "measure"].includes(step.step_key),
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ step_key: "schedule", status: "completed" }),
      expect.objectContaining({ step_key: "measure", status: "completed" }),
    ]),
  );
  expect(trace.executions.map((execution) => execution.status)).toEqual([
    "completed",
    "completed",
  ]);
});

test("recovers a failed workflow-linked approval continuation", async ({
  page,
}) => {
  await prepareWorkflowLinkedScheduleAgent(page);
  await markWorkflowLinkedAgentFailed(page);

  await openApprovals(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await resumeAgentRun(page, 1);

  const trace = await getWorkflowTraceState(page);
  expect(trace.runs[0]).toMatchObject({
    status: "running",
    current_step_key: "measure",
  });
  expect(
    trace.steps.find((step) => step.step_key === "schedule"),
  ).toMatchObject({
    status: "completed",
    error_message: "",
  });
  expect(trace.steps.find((step) => step.step_key === "measure")?.status).toBe(
    "running",
  );
  expect(trace.executions[0]).toMatchObject({
    status: "completed",
    error_summary: "",
  });
});

test("reconciles workflow-linked schedule rejection", async ({ page }) => {
  await prepareWorkflowLinkedScheduleAgent(page);

  await openApprovals(page);
  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reject" }).click();

  const trace = await getWorkflowTraceState(page);
  expect(trace.runs[0]).toMatchObject({
    status: "blocked",
    current_step_key: "schedule",
  });
  expect(
    trace.steps.find((step) => step.step_key === "schedule"),
  ).toMatchObject({
    status: "blocked",
    error_message: expect.stringContaining("Approval rejected"),
  });
  expect(trace.executions[0]).toMatchObject({
    status: "cancelled",
    error_summary: expect.stringContaining("Approval rejected"),
  });
  expect(trace.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event_type: "step_blocked" }),
    ]),
  );
});

test("cancels a failed workflow-linked schedule continuation", async ({
  page,
}) => {
  await prepareWorkflowLinkedScheduleAgent(page);
  await markWorkflowLinkedAgentFailed(page);

  await cancelAgentRun(page, 1);

  const trace = await getWorkflowTraceState(page);
  expect(trace.runs[0]).toMatchObject({
    status: "blocked",
    current_step_key: "schedule",
  });
  expect(
    trace.steps.find((step) => step.step_key === "schedule"),
  ).toMatchObject({
    status: "blocked",
    error_message: "Continuation provider unavailable.",
  });
  expect(trace.executions[0]).toMatchObject({
    status: "cancelled",
    error_summary: "Continuation provider unavailable.",
  });
  expect(trace.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event_type: "step_blocked" }),
    ]),
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

type WorkflowTraceState = {
  runs: Array<{
    status: string;
    current_step_key: string;
  }>;
  steps: Array<{
    id: number;
    step_key: string;
    status: string;
    output_summary: string;
    error_message: string;
  }>;
  events: Array<{ event_type: string }>;
  executions: Array<{
    id: number;
    agent_run_id: number | null;
    status: string;
    error_summary: string;
  }>;
};

async function getWorkflowTraceState(page: Page): Promise<WorkflowTraceState> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __LINKGO_SQL_WORKFLOW_RUNS__?: () => WorkflowTraceState["runs"];
      __LINKGO_SQL_WORKFLOW_STEPS__?: () => WorkflowTraceState["steps"];
      __LINKGO_SQL_WORKFLOW_EVENTS__?: () => WorkflowTraceState["events"];
      __LINKGO_SQL_WORKFLOW_STEP_EXECUTIONS__?: () => WorkflowTraceState["executions"];
    };
    const readRuns = testWindow.__LINKGO_SQL_WORKFLOW_RUNS__;
    const readSteps = testWindow.__LINKGO_SQL_WORKFLOW_STEPS__;
    const readEvents = testWindow.__LINKGO_SQL_WORKFLOW_EVENTS__;
    const readExecutions = testWindow.__LINKGO_SQL_WORKFLOW_STEP_EXECUTIONS__;
    if (!readRuns || !readSteps || !readEvents || !readExecutions) {
      throw new Error("Workflow trace test state is unavailable");
    }
    return {
      runs: readRuns(),
      steps: readSteps(),
      events: readEvents(),
      executions: readExecutions(),
    };
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
    if (!internals) throw new Error("Tauri mocks unavailable");
    return internals.invoke("plugin:sql|execute", sqlArgs);
  }, args);
}

async function setWorkflowStepState(
  page: Page,
  stepId: number,
  status: string,
): Promise<void> {
  await executeSql(page, {
    query: `UPDATE workflow_steps
      SET status = $1, output_summary = $2, error_message = $3, updated_at = datetime('now')
      WHERE id = $4`,
    values: [status, "", "", stepId],
  });
}

async function prepareWorkflowLinkedScheduleAgent(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await seedWorkflowApproval(page);
  await openWorkflows(page);
  await createWorkflowRun(page);

  for (const stepId of [1, 2, 3, 4, 5]) {
    await setWorkflowStepState(page, stepId, "completed");
  }
  await setWorkflowStepState(page, 6, "running");
  await executeSql(page, {
    query: `UPDATE workflow_runs
      SET status = $1, current_step_key = $2, updated_at = datetime('now')
      WHERE id = $3`,
    values: ["running", "schedule", 1],
  });

  await page.getByRole("button", { name: "Run executor" }).click();
  await expect
    .poll(async () => (await getWorkflowTraceState(page)).runs[0]?.status)
    .toBe("waiting_approval");
  const trace = await getWorkflowTraceState(page);
  expect(trace.steps.find((step) => step.step_key === "schedule")?.status).toBe(
    "waiting_approval",
  );
  expect(trace.executions[0]?.status).toBe("waiting_approval");
}

async function markWorkflowLinkedAgentFailed(page: Page): Promise<void> {
  await setWorkflowStepState(page, 6, "failed");
  await executeSql(page, {
    query: `UPDATE workflow_runs
      SET status = $1, current_step_key = $2, updated_at = datetime('now')
      WHERE id = $3`,
    values: ["failed", "schedule", 1],
  });
  await executeSql(page, {
    query: `UPDATE agent_runs
      SET status = 'failed', error_message = $1, completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = $2`,
    values: ["Continuation provider unavailable.", 1],
  });
}

async function resumeAgentRun(page: Page, id: number): Promise<void> {
  await page.evaluate(async (agentRunId) => {
    const resume = (
      window as unknown as {
        __LINKGO_AGENT_RUNTIME_TEST_API__?: {
          resumeAgentRun: (input: { id: number }) => Promise<void>;
        };
      }
    ).__LINKGO_AGENT_RUNTIME_TEST_API__?.resumeAgentRun;
    if (!resume) throw new Error("Agent runtime test API unavailable");
    await resume({ id: agentRunId });
  }, id);
}

async function cancelAgentRun(page: Page, id: number): Promise<void> {
  await page.evaluate(async (agentRunId) => {
    const cancel = (
      window as unknown as {
        __LINKGO_AGENT_RUNTIME_TEST_API__?: {
          cancelAgentRun: (input: { id: number }) => Promise<void>;
        };
      }
    ).__LINKGO_AGENT_RUNTIME_TEST_API__?.cancelAgentRun;
    if (!cancel) throw new Error("Agent runtime test API unavailable");
    await cancel({ id: agentRunId });
  }, id);
}

async function resumeWorkflowRun(page: Page, id: number): Promise<void> {
  await page.evaluate(async (workflowRunId) => {
    const resume = (
      window as unknown as {
        __LINKGO_WORKFLOWS_TEST_API__?: {
          resumeWorkflowRun: (input: { id: number }) => Promise<void>;
        };
      }
    ).__LINKGO_WORKFLOWS_TEST_API__?.resumeWorkflowRun;
    if (!resume) throw new Error("Workflow resume test API unavailable");
    await resume({ id: workflowRunId });
  }, id);
}

async function openApprovals(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Approvals/ }).click();
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
}

async function seedWorkflowApproval(page: Page): Promise<void> {
  await executeSql(page, {
    query: `INSERT INTO target_posts (platform, url, normalized_url, author_name, author_profile_url, platform_resource_urn, posted_at, content, content_hash, updated_at) VALUES ('linkedin', $1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
    values: [
      "https://www.linkedin.com/posts/workflow-schedule/",
      "https://www.linkedin.com/posts/workflow-schedule/",
      "Workflow Author",
      "",
      "urn:li:activity:workflow-schedule",
      null,
      "Workflow schedule candidate",
      "workflow-schedule-hash",
    ],
  });
  await executeSql(page, {
    query: `INSERT INTO candidate_posts (campaign_id, target_post_id, source_keyword, relevance_score, score_reason, notes, updated_at) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
    values: [1, 1, "workflow", 90, "Workflow fixture", ""],
  });
  await executeSql(page, {
    query:
      "INSERT INTO drafts (campaign_id, candidate_post_id, angle, notes, updated_at) VALUES ($1, $2, $3, $4, datetime('now'))",
    values: [1, 1, "Schedule metadata", "Workflow approval fixture"],
  });
  await executeSql(page, {
    query:
      "INSERT INTO draft_variants (draft_id, variant_number, hook, body, cta, hashtags, updated_at) VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))",
    values: [
      1,
      1,
      "Workflow-linked approval",
      "A local metadata-only scheduling request.",
      "Review before continuing.",
      "#ContentOps",
    ],
  });
  await executeSql(page, {
    query:
      "UPDATE draft_variants SET status = 'selected', updated_at = datetime('now') WHERE id = $1",
    values: [1],
  });
  await executeSql(page, {
    query:
      "UPDATE drafts SET status = 'ready_for_review', updated_at = datetime('now') WHERE id = $1",
    values: [1],
  });
  await executeSql(page, {
    query:
      "INSERT INTO approvals (campaign_id, draft_id, draft_variant_id, status, reviewer_notes, updated_at) VALUES ($1, $2, $3, 'needs_review', $4, datetime('now'))",
    values: [1, 1, 1, "Review workflow-linked schedule metadata."],
  });
}

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
