import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";
import { openSection } from "./helpers/navigation";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

test("records manual metrics for a published approval", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);

  await recordMetrics(page);

  await expectSummaryValue(page, "Posts tracked", "1");
  await expectSummaryValue(page, "Total impressions", "1,200");
  await expectSummaryValue(page, "Average engagement", "7.5%");
  await expect(page.getByText("Jane Operator").first()).toBeVisible();
  await expect(page.getByText("Engagement rate")).toBeVisible();
  await expect(
    page.getByText("Click-through rate", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("4.2%")).toBeVisible();
  await expect(
    page.getByText("Metric snapshot recorded for approval #1"),
  ).toBeVisible();
});

test("starts and stops metric refresh from Metrics tab", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);

  await page.getByRole("button", { name: /Turn on auto-update/ }).click();
  await expectSummaryValue(page, "Auto-update", "On");

  await page.getByRole("button", { name: /Turn off auto-update: On$/ }).click();
  await expectSummaryValue(page, "Auto-update", "Off");
});

test("shows enabled metric refresh when worker is not running", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await setMetricRefreshEnabled(page, true);
  await openMetrics(page);

  await expectSummaryValue(page, "Auto-update", "On (paused)");
  await expect(
    page.getByRole("button", { name: /Turn off auto-update: On \(paused\)/ }),
  ).toBeVisible();
});

test("runs LinkedIn metric refresh and records API-sourced reactions and comments", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);

  await page.getByRole("button", { name: "Update from LinkedIn now" }).click();

  await expectSummaryValue(page, "Posts tracked", "1");
  await expectSummaryValue(page, "Updates from LinkedIn", "1");
  await expect(page.getByText("From LinkedIn", { exact: true })).toBeVisible();
  await expect(page.getByText("A zero for impressions, reposts")).toBeVisible();
  await expect(
    page.getByText("LinkedIn social metadata refresh completed."),
  ).toBeVisible();
});

test("shows backend string error when metric refresh tick rejects", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_METRIC_REFRESH_TICK_ERROR__ =
      "LinkedIn credentials are missing.";
  });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);

  await page.getByRole("button", { name: "Update from LinkedIn now" }).click();

  await expect(
    page.getByText("LinkedIn credentials are missing."),
  ).toBeVisible();
});

test("marks metric refresh unavailable when LinkedIn target URN is missing", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/posts/manual-success/",
  );
  await openMetrics(page);

  await page.getByRole("button", { name: "Update from LinkedIn now" }).click();

  await expectSummaryValue(page, "Not available", "1");
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
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await setGlobalKillSwitch(page, true);
  await openMetrics(page);

  await page.getByRole("button", { name: "Update from LinkedIn now" }).click();

  await expectSummaryValue(page, "Updates from LinkedIn", "0");
  await expect(
    page.getByText("Analytics update skipped: Everything is paused"),
  ).toBeVisible();
});

test("saves campaign memory from a metric", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);
  await recordMetrics(page);

  await page.getByRole("button", { name: "Save lesson" }).click();
  const dialog = page.getByRole("dialog", { name: "Save a lesson" });
  await dialog.getByLabel("Type of lesson").selectOption("winner");
  await dialog
    .getByLabel("Summary")
    .fill("High-engagement tactical post worth reusing.");
  await dialog
    .getByLabel("What you saw")
    .fill("90 engagements from 1,200 impressions with strong CTR.");
  await dialog.getByLabel("How sure are you? (%)").fill("82");
  await dialog.getByRole("button", { name: "Save lesson" }).click();
  await expect(dialog).toBeHidden();

  await expectSummaryValue(page, "Active notes", "1");
  await expect(getBadge(page, "Winner")).toBeVisible();
  await expect(page.getByText("82% sure")).toBeVisible();
  await expect(
    page.getByText("High-engagement tactical post worth reusing.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Campaign memory created/)).toBeVisible();
});

test("archives and restores campaign memory", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);
  await recordMetrics(page);
  await saveDefaultMemory(page);

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(getBadge(page, "Archived")).toBeVisible();
  await expectSummaryValue(page, "Active notes", "0");
  await expect(page.getByText("Campaign memory archived")).toBeVisible();

  await page.getByRole("button", { name: "Restore" }).click();
  await expect(getBadge(page, "Active").first()).toBeVisible();
  await expectSummaryValue(page, "Active notes", "1");
  await expect(page.getByText("Campaign memory restored")).toBeVisible();
});

test("a linked post asks How did it do? and fills in LinkedIn numbers first", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);
  await page.getByRole("button", { name: "Update from LinkedIn now" }).click();
  await expectSummaryValue(page, "Updates from LinkedIn", "1");

  await page.evaluate(() => {
    window.location.hash = "#/metrics?approvalId=1&campaignId=1";
  });
  const dialog = page.getByRole("dialog", { name: "How did it do?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("metric-linked-post")).toBeVisible();
  await expect(dialog.locator("#metric-approval")).toHaveCount(0);
  // The mock LinkedIn snapshot has 42 reactions and 7 comments.
  await expect(dialog.getByLabel("Reactions")).toHaveValue("42");
  await expect(dialog.getByLabel("Comments")).toHaveValue("7");
  await expect(dialog.getByRole("status")).toContainText(
    "filled in from LinkedIn",
  );
  await expect(dialog.getByLabel("Impressions")).toHaveValue("0");
});

test("Add results fills in LinkedIn numbers for the picked post", async ({
  page,
}) => {
  await addSecondEligiblePost(page);
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);
  await page.getByRole("button", { name: "Update from LinkedIn now" }).click();
  await expectSummaryValue(page, "Updates from LinkedIn", "1");

  await page.getByRole("button", { name: "Add results" }).click();
  const dialog = page.getByRole("dialog", { name: "Add results" });
  await expect(dialog).toBeVisible();
  // Post 2 has no LinkedIn snapshot; post 1 does (42 reactions, 7 comments).
  await dialog.locator("#metric-approval").selectOption("2");
  await expect(dialog.getByLabel("Reactions")).toHaveValue("0");
  await expect(dialog.getByRole("status")).toHaveCount(0);

  await dialog.locator("#metric-approval").selectOption("1");
  await expect(dialog.getByLabel("Reactions")).toHaveValue("42");
  await expect(dialog.getByLabel("Comments")).toHaveValue("7");
  await expect(dialog.getByRole("status")).toContainText(
    "filled in from LinkedIn",
  );

  await dialog.locator("#metric-approval").selectOption("2");
  await expect(dialog.getByLabel("Reactions")).toHaveValue("0");
  await expect(dialog.getByRole("status")).toHaveCount(0);
});

test("Add results keeps typed reactions when the picked post changes", async ({
  page,
}) => {
  await addSecondEligiblePost(page);
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(
    page,
    "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/",
  );
  await openMetrics(page);
  await page.getByRole("button", { name: "Update from LinkedIn now" }).click();
  await expectSummaryValue(page, "Updates from LinkedIn", "1");

  await page.getByRole("button", { name: "Add results" }).click();
  const dialog = page.getByRole("dialog", { name: "Add results" });
  await expect(dialog).toBeVisible();
  await dialog.locator("#metric-approval").selectOption("2");
  await dialog.getByLabel("Reactions").fill("5");

  await dialog.locator("#metric-approval").selectOption("1");
  await expect(dialog.getByLabel("Reactions")).toHaveValue("5");
  await expect(dialog.getByLabel("Comments")).toHaveValue("0");
  await expect(dialog.getByRole("status")).toHaveCount(0);
});

test("on a phone-sized window the results form fits and scrolls instead of clipping", async ({
  page,
}) => {
  // Phone size from the start: the New campaign dialog used in setup must
  // also fit and scroll (it used to clip its Create button off-screen).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);
  await page.evaluate(() => {
    window.location.hash = "#/metrics?approvalId=1&campaignId=1";
  });
  const dialog = page.getByRole("dialog", { name: "How did it do?" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
  await expect(
    dialog.getByRole("heading", { name: "How did it do?" }),
  ).toBeInViewport();
  const save = dialog.getByRole("button", { name: "Save results" });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
});

test("What's working stays quiet with too few results", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);
  await recordMetrics(page);

  const panel = page.getByRole("region", { name: "What’s working" });
  await expect(panel).toContainText("from 1 measured post");
  await expect(panel.getByTestId("pattern-opening")).toContainText(
    "Not enough results yet: 1 of 5 posts needed.",
  );
  await expect(
    panel.getByRole("button", { name: "Save as lesson" }),
  ).toHaveCount(0);
});

test("What's working shows a clear pattern and saves it as a lesson", async ({
  page,
}) => {
  await installSyntheticMetrics(page, [
    { approval: 11, hook: "Why do launches stall?", reactions: 30 },
    { approval: 12, hook: "What would you cut?", reactions: 20 },
    { approval: 13, hook: "Pricing is a product call", reactions: 10 },
    { approval: 14, hook: "Shipping beats polish", reactions: 10 },
    { approval: 15, hook: "Churn starts at signup", reactions: 10 },
  ]);
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openMetrics(page);

  const panel = page.getByRole("region", { name: "What’s working" });
  await expect(panel).toContainText("from 5 measured posts");
  const opening = panel.getByTestId("pattern-opening");
  await expect(opening).toContainText(
    "Opens with a question did better: 25 vs 10",
  );
  await expect(opening).toContainText("2 of 5 posts");
  await opening.getByRole("button", { name: "Save as lesson" }).click();

  await expect(
    opening.getByRole("button", { name: "Saved as lesson" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Open with a question", { exact: true }),
  ).toBeVisible();
  await expectSummaryValue(page, "Active notes", "1");
});

test("shows empty published-post state before anything is published", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page);
  await openMetrics(page);

  await expect(
    page.getByText("None of your posts have gone out yet"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "No posts yet" }),
  ).toBeDisabled();
  await expect(page.getByText("No results yet")).toBeVisible();
});

test("archived campaign hides mutation controls and rejects metric data mutations", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createPublishedApproval(page);
  await openMetrics(page);
  await recordMetrics(page);
  await saveDefaultMemory(page);

  await archiveSelectedCampaign(page);
  await openMetrics(page);

  await expect(page.getByText("You can see its past results")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save lesson" })).toBeHidden();
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

// Status badges only: the post-stage tracker repeats labels like "Posted".
const BADGE_SPAN_SELECTOR = 'span:not([data-testid="post-stage-tracker"] *)';

function getBadge(page: Page, label: string): Locator {
  return page.locator(BADGE_SPAN_SELECTOR).filter({
    hasText: new RegExp(`^${label.replaceAll("'", "\\u0027")}$`, "u"),
  });
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
  await openSection(page, "Create", "Campaigns");
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
}

async function openQueue(page: Page): Promise<void> {
  await openSection(page, "Create", "Ideas");
  await expect(
    page.getByRole("heading", { name: "Ideas", exact: true }),
  ).toBeVisible();
}

async function openDrafts(page: Page): Promise<void> {
  await openSection(page, "Create", "Drafts");
  await expect(
    page.getByRole("heading", { name: "Drafts", exact: true }),
  ).toBeVisible();
}

async function openApprovals(page: Page): Promise<void> {
  await openSection(page, "Create", "Approvals");
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
}

async function openMetrics(page: Page): Promise<void> {
  await openSection(page, "Results");
  await expect(
    page.getByRole("heading", { name: "Analytics", exact: true }),
  ).toBeVisible();
}

async function createPublishedApproval(
  page: Page,
  linkedInPostUrl = "https://www.linkedin.com/posts/manual-success/",
): Promise<void> {
  await createReadyDraft(page);
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await page.getByRole("button", { name: "Mark as posted" }).click();
  await page.getByLabel("LinkedIn post URL").fill(linkedInPostUrl);
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(getBadge(page, "Posted")).toBeVisible();
}

async function createReadyDraft(page: Page): Promise<void> {
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page);
  await page.getByRole("button", { name: "Choose this version" }).click();
  await expect(getBadge(page, "Ready for approval")).toBeVisible();
  const auditPanel = page.getByRole("region", { name: /AI review/ });
  await auditPanel.getByRole("button", { name: "Review with AI" }).click();
  await expect(auditPanel.getByText("Done", { exact: true })).toBeVisible();
}

async function makeDraftApprovalEligible(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const api = (
      window as unknown as {
        __LINKGO_DRAFTS_TEST_API__: {
          listDrafts: () => Promise<
            Array<{ variants: Array<{ id: number; status: string }> }>
          >;
          runDraftQualityLoop: (input: {
            draftVariantId: number;
          }) => Promise<unknown>;
        };
      }
    ).__LINKGO_DRAFTS_TEST_API__;
    const drafts = await api.listDrafts();
    const variantId = drafts[0]?.variants.find(
      (candidate) => candidate.status === "selected",
    )?.id;
    if (variantId === undefined)
      throw new Error("Selected variant was not found");
    await api.runDraftQualityLoop({ draftVariantId: variantId });
  });
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
  await page.getByRole("button", { name: "Add idea" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add idea" });
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
  await dialog.getByLabel("Match score").fill("87");
  await dialog.getByLabel("Score reason").fill("Strong audience overlap.");
  await dialog.getByLabel("Notes").fill("Good approval candidate.");
  await dialog.getByRole("button", { name: "Add idea" }).click();
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
  await page.getByRole("button", { name: "Send for approval" }).click();
  const dialog = page.getByRole("dialog", { name: "Send for approval" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reviewer notes").fill("Human pass before metrics.");
  await dialog.getByRole("button", { name: "Send for approval" }).click();
  await expect(dialog).toBeHidden();
}

async function recordMetrics(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add results" }).click();
  const dialog = page.getByRole("dialog", { name: "Add results" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Checked on").fill("2026-06-25T15:30");
  await dialog.getByLabel("Impressions").fill("1200");
  await dialog.getByLabel("Reactions").fill("60");
  await dialog.getByLabel("Comments").fill("20");
  await dialog.getByLabel("Reposts").fill("10");
  await dialog.getByLabel("Profile visits").fill("25");
  await dialog.getByLabel("Link clicks").fill("48");
  await dialog.getByLabel("Click-through rate % (optional)").fill("4.2");
  await dialog.getByLabel("Notes").fill("Strong manual snapshot.");
  await dialog.getByRole("button", { name: "Save results" }).click();
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
    await invoke("__linkgo_test_sql|execute", {
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
    await invoke("__linkgo_test_sql|execute", {
      db: "sqlite:linkgo.db",
      query:
        "UPDATE safety_settings SET global_kill_switch = $1, kill_switch_reason = $2",
      values: [nextEnabled ? 1 : 0, "Test kill switch"],
    });
  }, enabled);
}

/**
 * Appends a second published post (approval 2, no metrics) to the
 * eligible-approvals read so the dialog's post list can switch posts.
 */
async function addSecondEligiblePost(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    const original = internals.invoke.bind(internals);
    internals.invoke = async (
      cmd: string,
      args?: unknown,
    ): Promise<unknown> => {
      const result = await original(cmd, args);
      if (cmd !== "linkgo_metrics_eligible_approvals") return result;
      if (!Array.isArray(result) || result.length === 0) return result;
      const first = result[0] as Record<string, unknown>;
      return [
        ...result,
        { ...first, approval_id: 2, variant_number: 2, publish_attempt_id: 2 },
      ];
    };
  });
}

/**
 * Replaces the post-metrics read for campaign 1 with synthetic measured
 * posts; every other command still goes to the shared mocks.
 */
async function installSyntheticMetrics(
  page: Page,
  posts: Array<{ approval: number; hook: string; reactions: number }>,
): Promise<void> {
  await page.addInitScript((rows) => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    const original = internals.invoke.bind(internals);
    internals.invoke = (cmd: string, args?: unknown): Promise<unknown> => {
      if (cmd !== "linkgo_metrics_post_metrics_list")
        return original(cmd, args);
      return Promise.resolve(
        rows.map((row) => ({
          id: row.approval,
          campaign_id: 1,
          approval_id: row.approval,
          publish_attempt_id: row.approval,
          platform: "linkedin",
          measured_at: "2026-09-20T09:00",
          impressions: 0,
          reactions: row.reactions,
          comments: 0,
          reposts: 0,
          profile_visits: 0,
          link_clicks: 0,
          ctr: null,
          notes: "",
          collection_source: "manual",
          raw_payload_json: "{}",
          created_at: "2026-09-20 09:00:00",
          updated_at: "2026-09-20 09:00:00",
          campaign_name: "Founder-led growth",
          campaign_status: "active",
          approval_status: "published",
          draft_id: row.approval,
          draft_angle: "",
          draft_notes: "",
          variant_id: row.approval,
          variant_number: 1,
          variant_hook: row.hook,
          variant_body: "Short body.",
          variant_cta: "",
          variant_hashtags: "",
          variant_status: "selected",
          target_author_name: "Jane Operator",
          target_author_profile_url: "",
          target_content: "",
          target_url: "",
          publish_external_post_url: null,
          publish_platform_post_id: null,
          publish_created_at: "2026-09-15 09:00:00",
        })),
      );
    };
  }, posts);
}

async function saveDefaultMemory(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save lesson" }).click();
  const dialog = page.getByRole("dialog", { name: "Save a lesson" });
  await dialog
    .getByLabel("Summary")
    .fill("Reuse concrete customer interview posts.");
  await dialog.getByLabel("How sure are you? (%)").fill("75");
  await dialog.getByRole("button", { name: "Save lesson" }).click();
  await expect(dialog).toBeHidden();
}

async function archiveSelectedCampaign(page: Page): Promise<void> {
  await openCampaigns(page);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Archive" }).first().click();
  await expect(getBadge(page, "Archived")).toBeVisible();
}
