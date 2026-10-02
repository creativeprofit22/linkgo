import { expect, test, type Page } from "@playwright/test";

import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("shows local-only first-use guidance and opt-in controls", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openAutopilot(page);

  await expect(
    page.getByText(/never fetches from the web, uses AI, posts, or comments/u),
  ).toBeVisible();
  await expect(page.getByText("Autopilot status: Stopped")).toBeVisible();
  await expect(page.getByText("Create a campaign first")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check now" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Start Autopilot" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Campaign", { exact: true })).toHaveValue("all");
});

test("materializes eligible work on the immediate tick after Start planner", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Started planner", true);
  await setCampaignStatus(page, 1, "active");
  await seedAutopilotBatch(page, 1);
  await openAutopilot(page);

  await expectMetric(page, "Ready now", "1");
  await page.getByRole("button", { name: "Start Autopilot" }).click();

  await expect(page.getByText("Plan #1 · Started planner")).toBeVisible();
  await expect(page.getByText("Task #1 · Not started")).toBeVisible();
  await expect(
    page.getByText("Automation #1 · Waiting to start"),
  ).toBeVisible();
  const state = await getPlannerState(page);
  expect(state.plans).toHaveLength(1);
  expect(state.backlog).toHaveLength(1);
  expect(state.runs).toHaveLength(1);
  expect(state.events.slice(0, 2).map((event) => event.event_type)).toEqual([
    "planner_started",
    "tick_started",
  ]);

  await page.getByRole("button", { name: "Stop Autopilot" }).click();
  await expect(page.getByText("Autopilot status: Stopped")).toBeVisible();
});

test("materializes one linked plan, backlog item, and score-first workflow exactly once", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Planner launch", true);
  await setCampaignStatus(page, 1, "active");
  await seedAutopilotBatch(page, 1);
  await openAutopilot(page);

  await expectMetric(page, "Ready now", "1");
  await page.getByRole("button", { name: "Check now" }).click();

  await expect(page.getByText("Plan #1 · Planner launch")).toBeVisible();
  await expect(page.getByText("Task #1 · Not started")).toBeVisible();
  await expect(
    page.getByText("Automation #1 · Waiting to start"),
  ).toBeVisible();
  await expect(page.getByText("Current step: Score ideas")).toBeVisible();
  await expectMetric(page, "Tasks created", "1");
  await capturePlannerScreenshot(
    page,
    ".gg/screenshots/autopilot-planner-desktop.png",
  );

  await page.getByRole("button", { name: "Check now" }).click();
  const state = await getPlannerState(page);
  expect(state.plans).toHaveLength(1);
  expect(state.backlog).toHaveLength(1);
  expect(state.runs).toHaveLength(1);
  expect(state.steps).toHaveLength(7);
  expect(state.artifacts).toHaveLength(1);
  expect(state.artifacts[0]?.artifact_type).toBe("candidate_post");
  expect(state.artifacts[0]?.artifact_id).toBe(1);
  expect(state.steps.find((step) => step.step_key === "research")?.status).toBe(
    "completed",
  );
  expect(state.runs[0]?.current_step_key).toBe("score");

  await page.getByRole("button", { name: /^Tasks/u }).click();
  await expect(
    page.getByText(
      "Created by Autopilot plan #1 · import #1 · automation #1.",
      { exact: false },
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Automations/u }).click();
  await expect(
    page.getByText("Started by Autopilot from your imported ideas.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("Current step: Score relevance")).toBeVisible();
});

test("stores one durable skipped outcome when accepted candidates no longer exist", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Deleted candidates", true);
  await setCampaignStatus(page, 1, "active");
  await seedAutopilotBatch(page, 1, { currentCandidate: false });
  await openAutopilot(page);

  await expectMetric(page, "Ready now", "1");
  await page.getByRole("button", { name: "Check now" }).click();
  await expectMetric(page, "Ready now", "0");
  await expectMetric(page, "Skipped", "1");
  await expect(page.getByText("Result: Skipped")).toBeVisible();
  await expect(
    page.getByText(
      "No current accepted candidates remain for source batch #1.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check now" }).click();

  const state = await getPlannerState(page);
  expect(state.plans).toHaveLength(1);
  expect(state.plans[0]?.status).toBe("skipped");
  expect(state.backlog).toHaveLength(0);
  expect(state.runs).toHaveLength(0);
});

test("blocks starts and manual materialization behind the global kill switch", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Blocked planner", true);
  await setCampaignStatus(page, 1, "active");
  await seedAutopilotBatch(page, 1);
  await setKillSwitch(page, true, "Operator pause");
  await openAutopilot(page);

  await expect(page.getByText("Pause everything is on")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Autopilot" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(
    page.getByText("Autopilot check stopped because everything is paused."),
  ).toBeVisible();
  expect((await getPlannerState(page)).plans).toHaveLength(0);
});

test("stops later batches when the kill switch changes during a bounded tick", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Mid-tick pause", true);
  await setCampaignStatus(page, 1, "active");
  await seedAutopilotBatch(page, 1, {
    createdAt: "2026-07-31T10:00:00.000Z",
  });
  await seedAutopilotBatch(page, 1, {
    createdAt: "2026-07-31T11:00:00.000Z",
  });
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_ENABLE_KILL_SWITCH_AFTER_AUTOPILOT_PLAN__?: string;
      }
    ).__LINKGO_ENABLE_KILL_SWITCH_AFTER_AUTOPILOT_PLAN__ =
      "Operator pause after first plan";
  });
  await openAutopilot(page);

  await page.getByRole("button", { name: "Check now" }).click();

  await expect(
    page.getByRole("status").filter({
      hasText: "Check stopped early: 1 planned, 0 skipped, 0 failed, 1 paused.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "An import wasn't turned into tasks because everything is paused.",
      { exact: true },
    ),
  ).toBeVisible();
  let state = await getPlannerState(page);
  expect(state.plans).toHaveLength(1);
  expect(state.backlog).toHaveLength(1);
  expect(state.runs).toHaveLength(1);
  expect(state.steps).toHaveLength(7);
  const blockedEvent = state.events.find(
    (event) =>
      event.event_type === "planner_blocked" &&
      event.source_import_batch_id !== null,
  );
  expect(blockedEvent?.source_import_batch_id).toBe(2);
  expect(JSON.parse(blockedEvent?.metadata_json ?? "{}")).toEqual({
    reason: "Global kill switch is enabled: Operator pause after first plan",
  });

  await setKillSwitch(page, false);
  await page.getByRole("button", { name: "Check now" }).click();
  await page.getByRole("button", { name: "Check now" }).click();
  state = await getPlannerState(page);
  expect(state.plans).toHaveLength(2);
  expect(state.backlog).toHaveLength(2);
  expect(state.runs).toHaveLength(2);
  expect(state.steps).toHaveLength(14);
});

test("attributes rollback failures to the campaign filter and recovers on retry", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Rollback planner", true);
  await setCampaignStatus(page, 1, "active");
  await seedAutopilotBatch(page, 1);
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_FAIL_AUTOPILOT_PLAN__?: boolean }
    ).__LINKGO_FAIL_AUTOPILOT_PLAN__ = true;
  });
  await openAutopilot(page);

  await page.getByRole("button", { name: "Check now" }).click();
  await page.getByLabel("Campaign", { exact: true }).selectOption("1");
  await expectMetric(page, "Problems · 7 days", "1");
  await expect(
    page.getByText(
      "Source batch #1 could not be planned due to a local database error.",
      { exact: true },
    ),
  ).toBeVisible();
  let state = await getPlannerState(page);
  expect(
    state.events.find((event) => event.event_type === "batch_failed")
      ?.campaign_id,
  ).toBe(1);
  expect(state.plans).toHaveLength(0);
  expect(state.backlog).toHaveLength(0);
  expect(state.runs).toHaveLength(0);
  expect(state.steps).toHaveLength(0);

  await page.getByRole("button", { name: "Check now" }).click();
  state = await getPlannerState(page);
  expect(state.plans).toHaveLength(1);
  expect(state.backlog).toHaveLength(1);
  expect(state.runs).toHaveLength(1);
});

test("starts and stops once while duplicate planner actions are guarded", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openAutopilot(page);

  await page.getByRole("button", { name: "Start Autopilot" }).click();
  await expect(
    page.getByText("Autopilot status: Running while Linkgo is open"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop Autopilot" }).click();
  await expect(page.getByText("Autopilot status: Stopped")).toBeVisible();

  await page.getByRole("button", { name: "Check now" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(
    page.getByText("Autopilot check finished.").last(),
  ).toBeVisible();
  const events = await page.evaluate(() =>
    (
      window as unknown as {
        __LINKGO_SQL_AUTOPILOT_EVENTS__?: () => Array<{ event_type: string }>;
      }
    ).__LINKGO_SQL_AUTOPILOT_EVENTS__?.(),
  );
  expect(
    events?.filter((event) => event.event_type === "tick_started"),
  ).toHaveLength(2);
});

test("keeps a successful start when its dashboard refresh fails", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openAutopilot(page);
  await setAutopilotDashboardFailure(page, true);

  await page.getByRole("button", { name: "Start Autopilot" }).click();

  await expect(
    page.getByText("Autopilot status: Running while Linkgo is open"),
  ).toBeVisible();
  await expectSuccessfulActionWithRefreshFailure(page, "Autopilot started");
  await expect(
    page.getByText("We couldn't start Autopilot", { exact: true }),
  ).toHaveCount(0);
});

test("keeps a successful stop when its dashboard refresh fails", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openAutopilot(page);
  await page.getByRole("button", { name: "Start Autopilot" }).click();
  await expect(
    page.getByText("Autopilot status: Running while Linkgo is open"),
  ).toBeVisible();
  await setAutopilotDashboardFailure(page, true);

  await page.getByRole("button", { name: "Stop Autopilot" }).click();

  await expect(page.getByText("Autopilot status: Stopped")).toBeVisible();
  await expectSuccessfulActionWithRefreshFailure(page, "Autopilot stopped");
  await expect(
    page.getByText("We couldn't stop Autopilot", { exact: true }),
  ).toHaveCount(0);
});

test("keeps a successful tick result when its dashboard refresh fails", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Committed tick", true);
  await setCampaignStatus(page, 1, "active");
  await seedAutopilotBatch(page, 1);
  await openAutopilot(page);
  await setAutopilotDashboardFailure(page, true);

  await page.getByRole("button", { name: "Check now" }).click();

  await expectSuccessfulActionWithRefreshFailure(
    page,
    "Autopilot check finished",
  );
  await expect(
    page
      .getByText("Check finished: 1 planned, 0 skipped, 0 failed.", {
        exact: true,
      })
      .last(),
  ).toBeVisible();
  await expect(
    page.getByText("We couldn't finish the Autopilot check", { exact: true }),
  ).toHaveCount(0);
  expect((await getPlannerState(page)).plans).toHaveLength(1);
});

test("rejects invalid native status data and recovers with Retry", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_AUTOPILOT_STATUS_RESULT__?: unknown }
    ).__LINKGO_AUTOPILOT_STATUS_RESULT__ = {
      enabled: "yes",
      running: false,
      settings: {},
    };
  });
  await openAutopilot(page);

  await expect(page.getByText("We couldn't load Autopilot")).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_AUTOPILOT_STATUS_RESULT__?: unknown }
    ).__LINKGO_AUTOPILOT_STATUS_RESULT__ = undefined;
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Autopilot status: Stopped")).toBeVisible();
});

test("keeps the latest campaign filter when an older response resolves last", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "First planner campaign", true);
  await createCampaign(page, "Second planner campaign", true);
  await setCampaignStatus(page, 1, "active");
  await setCampaignStatus(page, 2, "active");
  await seedAutopilotBatch(page, 1, {
    createdAt: "2026-07-31T10:00:00.000Z",
  });
  await seedAutopilotBatch(page, 2, {
    createdAt: "2026-07-31T11:00:00.000Z",
  });
  await openAutopilot(page);
  await page.getByRole("button", { name: "Check now" }).click();

  await delayCampaignSelects(page, 1);
  await page.getByLabel("Campaign", { exact: true }).selectOption("1");
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__?: (
            campaignId: number,
          ) => number;
        }
      ).__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__?.(1) !== 0,
  );
  await page.getByLabel("Campaign", { exact: true }).selectOption("2");
  await expect(
    page.getByText("Plan #2 · Second planner campaign"),
  ).toBeVisible();
  await releaseCampaignSelects(page, 1);
  await expect(
    page.getByText("Plan #2 · Second planner campaign"),
  ).toBeVisible();
  await expect(page.getByText("Plan #1 · First planner campaign")).toBeHidden();
});

test("reflows at 320 pixels with forced colors, reduced motion, and keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openAutopilot(page);

  await expect(page.getByRole("button", { name: "Check now" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Autopilot" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).focus();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeFocused();
  const hasHorizontalOverflow = await page.evaluate(() => {
    const main = document.querySelector("section.flex-1");
    return main ? main.scrollWidth > main.clientWidth : true;
  });
  expect(hasHorizontalOverflow).toBe(false);
  await capturePlannerScreenshot(
    page,
    ".gg/screenshots/autopilot-planner-narrow.png",
  );
  const overflowAtTwoHundredPercent = await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    const main = document.querySelector("section.flex-1");
    if (!main) return ["missing main"];
    const mainRect = main.getBoundingClientRect();
    return Array.from(main.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > mainRect.right + 1 || rect.left < mainRect.left - 1;
      })
      .slice(0, 10)
      .map((element) => `${element.tagName}.${element.className}`);
  });
  expect(overflowAtTwoHundredPercent).toEqual([]);
});

async function capturePlannerScreenshot(
  page: Page,
  path: string,
): Promise<void> {
  if (process.env.LINKGO_CAPTURE_SCREENSHOTS !== "true") return;
  await page.waitForTimeout(4500);
  await page.screenshot({ path, fullPage: true });
}

async function openAutopilot(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Autopilot/u }).click();
  await expect(
    page.getByRole("heading", { name: "Autopilot", exact: true }),
  ).toBeVisible();
}

async function createCampaign(
  page: Page,
  name: string,
  autopilot: boolean,
): Promise<void> {
  await page.getByRole("button", { name: "Campaigns", exact: false }).click();
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name").fill(name);
  if (autopilot) await dialog.getByLabel("Include in Autopilot").click();
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function setCampaignStatus(
  page: Page,
  campaignId: number,
  status: "active" | "paused" | "archived" | "draft",
): Promise<void> {
  await page.evaluate(
    ({ id, nextStatus }) => {
      (
        window as unknown as {
          __LINKGO_SQL_SET_CAMPAIGN_STATUS__?: (
            campaignId: number,
            status: "active" | "paused" | "archived" | "draft",
          ) => void;
        }
      ).__LINKGO_SQL_SET_CAMPAIGN_STATUS__?.(id, nextStatus);
    },
    { id: campaignId, nextStatus: status },
  );
}

async function seedAutopilotBatch(
  page: Page,
  campaignId: number,
  options: {
    status?: "processing" | "completed" | "completed_with_errors" | "failed";
    currentCandidate?: boolean;
    acceptedCount?: number;
    createdAt?: string;
  } = {},
): Promise<number> {
  return page.evaluate(
    ({ id, seedOptions }) =>
      Number(
        (
          window as unknown as {
            __LINKGO_SQL_SEED_AUTOPILOT_BATCH__?: (
              campaignId: number,
              options: typeof seedOptions,
            ) => number;
          }
        ).__LINKGO_SQL_SEED_AUTOPILOT_BATCH__?.(id, seedOptions) ?? 0,
      ),
    { id: campaignId, seedOptions: options },
  );
}

async function setKillSwitch(
  page: Page,
  enabled: boolean,
  reason = "",
): Promise<void> {
  await page.evaluate(
    ({ nextEnabled, nextReason }) => {
      (
        window as unknown as {
          __LINKGO_SQL_SET_KILL_SWITCH__?: (
            enabled: boolean,
            reason?: string,
          ) => void;
        }
      ).__LINKGO_SQL_SET_KILL_SWITCH__?.(nextEnabled, nextReason);
    },
    { nextEnabled: enabled, nextReason: reason },
  );
}

async function setAutopilotDashboardFailure(
  page: Page,
  enabled: boolean,
): Promise<void> {
  await page.evaluate((shouldFail) => {
    (
      window as unknown as { __LINKGO_FAIL_AUTOPILOT_SELECT__?: boolean }
    ).__LINKGO_FAIL_AUTOPILOT_SELECT__ = shouldFail;
  }, enabled);
}

async function expectSuccessfulActionWithRefreshFailure(
  page: Page,
  successMessage: string,
): Promise<void> {
  await expect(page.getByText(successMessage, { exact: true })).toBeVisible();
  await expect(
    page.getByText("We couldn't refresh this page", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "That worked, but we couldn't refresh this page: Injected autopilot planner load failure",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
}

async function expectMetric(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const card = page.getByText(label, { exact: true }).locator("..");
  await expect(card.getByText(value, { exact: true })).toBeVisible();
}

async function getPlannerState(page: Page): Promise<{
  plans: Array<{ status: string }>;
  backlog: Array<{ id: number }>;
  runs: Array<{ current_step_key: string }>;
  steps: Array<{ step_key: string; status: string }>;
  artifacts: Array<{ artifact_type: string; artifact_id: number }>;
  events: Array<{
    campaign_id: number | null;
    event_type: string;
    source_import_batch_id: number | null;
    metadata_json: string;
  }>;
}> {
  return page.evaluate(() => {
    const testWindow = window as unknown as {
      __LINKGO_SQL_AUTOPILOT_PLANS__?: () => Array<{ status: string }>;
      __LINKGO_SQL_BACKLOG_ITEMS__?: () => Array<{ id: number }>;
      __LINKGO_SQL_WORKFLOW_RUNS__?: () => Array<{ current_step_key: string }>;
      __LINKGO_SQL_WORKFLOW_STEPS__?: () => Array<{
        step_key: string;
        status: string;
      }>;
      __LINKGO_SQL_WORKFLOW_ARTIFACTS__?: () => Array<{
        artifact_type: string;
        artifact_id: number;
      }>;
      __LINKGO_SQL_AUTOPILOT_EVENTS__?: () => Array<{
        campaign_id: number | null;
        event_type: string;
        source_import_batch_id: number | null;
        metadata_json: string;
      }>;
    };
    return {
      plans: testWindow.__LINKGO_SQL_AUTOPILOT_PLANS__?.() ?? [],
      backlog: testWindow.__LINKGO_SQL_BACKLOG_ITEMS__?.() ?? [],
      runs: testWindow.__LINKGO_SQL_WORKFLOW_RUNS__?.() ?? [],
      steps: testWindow.__LINKGO_SQL_WORKFLOW_STEPS__?.() ?? [],
      artifacts: testWindow.__LINKGO_SQL_WORKFLOW_ARTIFACTS__?.() ?? [],
      events: testWindow.__LINKGO_SQL_AUTOPILOT_EVENTS__?.() ?? [],
    };
  });
}

async function delayCampaignSelects(
  page: Page,
  campaignId: number,
): Promise<void> {
  await page.evaluate((id) => {
    (
      window as unknown as {
        __LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__?: (campaignId: number) => void;
      }
    ).__LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__?.(id);
  }, campaignId);
}

async function releaseCampaignSelects(
  page: Page,
  campaignId: number,
): Promise<void> {
  await page.evaluate((id) => {
    (
      window as unknown as {
        __LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__?: (campaignId: number) => void;
      }
    ).__LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__?.(id);
  }, campaignId);
}
