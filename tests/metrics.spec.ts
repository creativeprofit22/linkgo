import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

test("records manual metrics for a published approval", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);

  await recordMetrics(page);

  await expectSummaryValue(page, "Measured posts", "1");
  await expectSummaryValue(page, "Total impressions", "1,200");
  await expectSummaryValue(page, "Avg engagement", "7.5%");
  await expect(page.getByText("Jane Operator").first()).toBeVisible();
  await expect(page.getByText("Engagement rate")).toBeVisible();
  await expect(page.getByText("CTR", { exact: true })).toBeVisible();
  await expect(page.getByText("4.2%")).toBeVisible();
  await expect(
    page.getByText("Metric snapshot recorded for approval #1"),
  ).toBeVisible();
});

test("starts and stops metric refresh from Metrics tab", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);

  await page.getByRole("button", { name: /Start metric refresh/ }).click();
  await expectSummaryValue(page, "API refresh", "Running");

  await page.getByRole("button", { name: /Stop metric refresh/ }).click();
  await expectSummaryValue(page, "API refresh", "Stopped");
});

test("shows enabled metric refresh when worker is not running", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await setMetricRefreshEnabled(page, true);
  await openMetrics(page);

  await expectSummaryValue(page, "API refresh", "Enabled (not running)");
  await expect(
    page.getByRole("button", { name: /Disable metric refresh/ }),
  ).toBeVisible();
});

test("runs LinkedIn metric refresh and records API-sourced reactions and comments", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);

  await page
    .getByRole("button", { name: "Refresh LinkedIn metrics now" })
    .click();

  await expectSummaryValue(page, "Measured posts", "1");
  await expectSummaryValue(page, "Last API snapshots", "1");
  await expect(
    page.getByText("LinkedIn social metadata", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Zero impressions, reposts")).toBeVisible();
  await expect(
    page.getByText("LinkedIn social metadata refresh completed."),
  ).toBeVisible();
});

test("shows backend string error when metric refresh tick rejects", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_METRIC_REFRESH_TICK_ERROR__ = "LinkedIn credentials are missing.";
  });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);

  await page
    .getByRole("button", { name: "Refresh LinkedIn metrics now" })
    .click();

  await expect(page.getByText("LinkedIn credentials are missing.")).toBeVisible();
});

test("marks metric refresh unavailable when LinkedIn target URN is missing", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/posts/manual-success/",
  );
  await openMetrics(page);

  await page
    .getByRole("button", { name: "Refresh LinkedIn metrics now" })
    .click();

  await expectSummaryValue(page, "Unavailable", "1");
  await expect(
    page.getByText("LinkedIn target URN could not be resolved"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Metric refresh is unavailable because no LinkedIn target URN could be resolved.",
    ),
  ).toBeVisible();
});

test("global kill switch blocks metric refresh without inserting API snapshot", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await setGlobalKillSwitch(page, true);
  await openMetrics(page);

  await page
    .getByRole("button", { name: "Refresh LinkedIn metrics now" })
    .click();

  await expectSummaryValue(page, "Last API snapshots", "0");
  await expect(
    page.getByText("Metric refresh skipped: Global kill switch is enabled"),
  ).toBeVisible();
});

test("saves campaign memory from a metric", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);
  await recordMetrics(page);

  await page.getByRole("button", { name: "Save memory" }).click();
  const dialog = page.getByRole("dialog", { name: "Save campaign memory" });
  await dialog.getByLabel("Signal").selectOption("winner");
  await dialog
    .getByLabel("Summary")
    .fill("High-engagement tactical post worth reusing.");
  await dialog
    .getByLabel("Evidence")
    .fill("90 engagements from 1,200 impressions with strong CTR.");
  await dialog.getByLabel("Confidence").fill("82");
  await dialog.getByRole("button", { name: "Save memory" }).click();
  await expect(dialog).toBeHidden();

  await expectSummaryValue(page, "Active memories", "1");
  await expect(getBadge(page, "Winner")).toBeVisible();
  await expect(page.getByText("82% confidence")).toBeVisible();
  await expect(
    page.getByText("High-engagement tactical post worth reusing.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Campaign memory created/)).toBeVisible();
});

test("archives and restores campaign memory", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);
  await recordMetrics(page);
  await saveDefaultMemory(page);

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(getBadge(page, "Archived")).toBeVisible();
  await expectSummaryValue(page, "Active memories", "0");
  await expect(page.getByText("Campaign memory archived")).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).click();
  await expect(getBadge(page, "Active").first()).toBeVisible();
  await expectSummaryValue(page, "Active memories", "1");
  await expect(page.getByText("Campaign memory restored")).toBeVisible();
});

test("shows empty published-post state before anything is published", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page);
  await openMetrics(page);

  await expect(
    page.getByText("No published posts are ready for metrics"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "No published posts" }),
  ).toBeDisabled();
  await expect(page.getByText("No metrics yet")).toBeVisible();
});

test("archived campaign hides mutation controls and rejects metric data mutations", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);
  await recordMetrics(page);
  await saveDefaultMemory(page);

  await archiveSelectedCampaign(page);
  await openMetrics(page);

  await expect(
    page.getByText("Archived campaigns keep metric history visible"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save memory" })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Archive", exact: true }),
  ).toBeHidden();

  await page.waitForFunction(() => "__LINKGO_METRICS_TEST_API__" in window);
  const result = await page.evaluate(async () => {
    const metricsTestApi = (
      window as unknown as {
        __LINKGO_METRICS_TEST_API__?: {
          createCampaignMemory: (input: {
            campaignId: number;
            signal: "insight";
            summary: string;
          }) => Promise<number>;
        };
      }
    ).__LINKGO_METRICS_TEST_API__;

    if (metricsTestApi === undefined) {
      return { ok: false, message: "Metrics test API was not initialized" };
    }

    try {
      await metricsTestApi.createCampaignMemory({
        campaignId: 1,
        signal: "insight",
        summary: "Should fail for archived campaigns.",
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

async function expectSummaryValue(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const card = page.locator("div").filter({
    hasText: new RegExp(`^${escapeRegExp(label)}${escapeRegExp(value)}$`, "u"),
  });
  await expect(card.first()).toBeVisible();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function openCampaigns(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
}

async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();
}

async function openDrafts(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Drafts/ }).click();
  await expect(
    page.getByRole("heading", { name: "Drafts", exact: true }),
  ).toBeVisible();
}

async function openApprovals(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Approvals/ }).click();
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
}

async function openMetrics(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Metrics/ }).click();
  await expect(
    page.getByRole("heading", { name: "Metrics", exact: true }),
  ).toBeVisible();
}

async function createPublishedApproval(
  page: Page,
  linkedInPostUrl = "https://www.linkedin.com/posts/manual-success/",
): Promise<void> {
  await createReadyDraft(page);
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await page.getByRole("button", { name: "Mark published" }).click();
  await page.getByLabel("LinkedIn post URL").fill(linkedInPostUrl);
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Record attempt" }).click();
  await expect(getBadge(page, "Published")).toBeVisible();
}

async function createReadyDraft(page: Page): Promise<void> {
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page);
  await page.getByRole("button", { name: "Select for review" }).click();
  await expect(getBadge(page, "Ready for review")).toBeVisible();
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

async function addCandidate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add candidate" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add candidate" });
  await expect(dialog).toBeVisible();

  await dialog
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/example-activity-123/");
  await dialog
    .getByLabel("Post text")
    .fill("This founder post has a sharp ICP signal.");
  await dialog.getByLabel("Author name").fill("Jane Operator");
  await dialog
    .getByLabel("Author profile URL")
    .fill("https://www.linkedin.com/in/jane-operator/");
  await dialog.getByLabel("Posted at").fill("2026-06-25");
  await dialog.getByLabel("Source keyword").fill("founder content");
  await dialog.getByLabel("Relevance score").fill("87");
  await dialog.getByLabel("Score reason").fill("Strong audience overlap.");
  await dialog.getByLabel("Notes").fill("Good approval candidate.");
  await dialog.getByRole("button", { name: "Add candidate" }).click();
  await expect(dialog).toBeHidden();
}

async function createDraft(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create draft" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create draft" });
  await expect(dialog).toBeVisible();

  await dialog
    .getByLabel("Angle")
    .fill("Turn the source post into a tactical lesson");
  await dialog.getByLabel("Notes").fill("Keep the operator tone concrete.");
  await dialog
    .locator("#draft-variant-0-hook")
    .fill("We turned 12 customer interviews into one simple sales motion");
  await dialog
    .locator("#draft-variant-0-body")
    .fill(
      "The useful part was not the script. It was the pattern behind the replies.",
    );
  await dialog
    .locator("#draft-variant-0-cta")
    .fill("Save this before your next outbound sprint.");
  await dialog
    .locator("#draft-variant-0-hashtags")
    .fill("#LinkedInGrowth #Sales");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(dialog).toBeHidden();
}

async function createReview(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create review" }).click();
  const dialog = page.getByRole("dialog", { name: "Create review" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reviewer notes").fill("Human pass before metrics.");
  await dialog.getByRole("button", { name: "Create review" }).click();
  await expect(dialog).toBeHidden();
}

async function recordMetrics(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Record metrics" }).click();
  const dialog = page.getByRole("dialog", { name: "Record metrics" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Measured at").fill("2026-06-25T15:30");
  await dialog.getByLabel("Impressions").fill("1200");
  await dialog.getByLabel("Reactions").fill("60");
  await dialog.getByLabel("Comments").fill("20");
  await dialog.getByLabel("Reposts").fill("10");
  await dialog.getByLabel("Profile visits").fill("25");
  await dialog.getByLabel("Link clicks").fill("48");
  await dialog.getByLabel("CTR percent optional").fill("4.2");
  await dialog.getByLabel("Notes").fill("Strong manual snapshot.");
  await dialog.getByRole("button", { name: "Record metrics" }).click();
  await expect(dialog).toBeHidden();
}

async function setMetricRefreshEnabled(
  page: Page,
  enabled: boolean,
): Promise<void> {
  await page.evaluate(async (nextEnabled) => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__?.invoke;
    if (!invoke) throw new Error("Tauri mock invoke was not initialized");
    await invoke("plugin:sql|execute", {
      db: "sqlite:linkgo.db",
      query: "UPDATE metric_refresh_settings SET enabled = $1",
      values: [nextEnabled ? 1 : 0],
    });
  }, enabled);
}

async function setGlobalKillSwitch(
  page: Page,
  enabled: boolean,
): Promise<void> {
  await page.evaluate(async (nextEnabled) => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__?.invoke;
    if (!invoke) throw new Error("Tauri mock invoke was not initialized");
    await invoke("plugin:sql|execute", {
      db: "sqlite:linkgo.db",
      query:
        "UPDATE safety_settings SET global_kill_switch = $1, kill_switch_reason = $2",
      values: [nextEnabled ? 1 : 0, "Test kill switch"],
    });
  }, enabled);
}

async function saveDefaultMemory(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save memory" }).click();
  const dialog = page.getByRole("dialog", { name: "Save campaign memory" });
  await dialog
    .getByLabel("Summary")
    .fill("Reuse concrete customer interview posts.");
  await dialog.getByLabel("Confidence").fill("75");
  await dialog.getByRole("button", { name: "Save memory" }).click();
  await expect(dialog).toBeHidden();
}

async function archiveSelectedCampaign(page: Page): Promise<void> {
  await openCampaigns(page);
  await page.getByRole("button", { name: "Archive" }).first().click();
  await expect(getBadge(page, "Archived")).toBeVisible();
}
