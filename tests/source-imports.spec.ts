import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH,
  MAX_SOURCE_IMPORT_REASON_LENGTH,
} from "../src/features/source-imports/schemas";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("imports two valid rows into candidates and a completed batch", async ({
  page,
}) => {
  await openQueueWithCampaign(page);

  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("one", "First imported source post", "Ada One"),
        sourceRow("two", "Second imported source post", "Ben Two"),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import completed", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("2 accepted, 0 duplicate, 0 rejected."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("heading", { name: "Ada One" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ben Two" })).toBeVisible();
  await expect(page.getByText("Batch 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Completed", { exact: true }).last(),
  ).toBeVisible();

  const state = await getSourceImportState(page);
  expect(state.candidates).toHaveLength(2);
  expect(state.batches).toEqual([
    expect.objectContaining({
      status: "completed",
      total_count: 2,
      accepted_count: 2,
      duplicate_count: 0,
      rejected_count: 0,
    }),
  ]);
  expect(state.items).toHaveLength(2);
  expect(state.items.every((item) => item.status === "accepted")).toBe(true);
});

test("reports duplicate URL and content rows without extra candidates", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const duplicateContent = "The same imported source text.";
  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("duplicate", duplicateContent, "First Author"),
        sourceRow("duplicate", "Different text, same URL", "Second Author"),
        sourceRow("other-url", duplicateContent, "Third Author"),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import completed with review items"),
  ).toBeVisible();
  await expect(
    dialog.getByText("1 accepted, 2 duplicate, 0 rejected."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText("Duplicate URL or post text for this campaign.").first(),
  ).toBeVisible();

  const state = await getSourceImportState(page);
  expect(state.candidates).toHaveLength(1);
  expect(state.items.map((item) => item.status)).toEqual([
    "accepted",
    "duplicate",
    "duplicate",
  ]);
});

test("preserves valid rows and field-specific reasons in a mixed batch", async ({
  page,
}, testInfo) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  await dialog.getByLabel("Source posts JSON").fill(
    sourceJson([
      sourceRow("valid", "A valid source post", "Valid Author"),
      {
        url: " ",
        content: "x".repeat(3001),
        authorName: "a".repeat(161),
        authorProfileUrl: "p".repeat(1001),
        postedAt: "2".repeat(81),
      },
    ]),
  );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("1 accepted, 0 duplicate, 1 rejected."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByRole("heading", { name: "Valid Author" }),
  ).toBeVisible();
  await expect(
    page.getByText("URL: LinkedIn post URL is required", { exact: false }),
  ).toBeVisible();

  const state = await getSourceImportState(page);
  expect(state.candidates).toHaveLength(1);
  expect(state.items.map((item) => item.status)).toEqual([
    "accepted",
    "rejected",
  ]);

  if (process.env.LINKGO_CAPTURE_SOURCE_IMPORTS === "true") {
    await captureSourceImportVisualEvidence(page, testInfo);
  }
});

test("bounds validation reasons while preserving valid neighboring rows", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  const unexpectedFields = Object.fromEntries(
    Array.from({ length: 150 }, (_, index) => [
      `unexpected_field_${index}_${"x".repeat(24)}`,
      true,
    ]),
  );
  await dialog.getByLabel("Source posts JSON").fill(
    sourceJson([
      sourceRow("reason-valid", "A valid neighboring row", "Valid Neighbor"),
      {
        ...sourceRow("reason-invalid", "Invalid unknown fields", "Invalid Row"),
        ...unexpectedFields,
      },
    ]),
  );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("1 accepted, 0 duplicate, 1 rejected."),
  ).toBeVisible();
  const state = await getSourceImportState(page);
  expect(state.candidates).toHaveLength(1);
  expect(state.items.map((item) => item.status)).toEqual([
    "accepted",
    "rejected",
  ]);
  expect(String(state.items[1]?.reason).length).toBeLessThanOrEqual(
    MAX_SOURCE_IMPORT_REASON_LENGTH,
  );
});

test("preserves valid rows when an invalid scalar exceeds the audit limit", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("bounded", "A valid bounded source post", "Bounded Author"),
        "x".repeat(MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH + 5_000),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import completed with review items"),
  ).toBeVisible();
  await expect(
    dialog.getByText("1 accepted, 0 duplicate, 1 rejected."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  const state = await getSourceImportState(page);
  expect(state.candidates).toHaveLength(1);
  expect(state.batches[0]).toMatchObject({
    status: "completed_with_errors",
    accepted_count: 1,
    rejected_count: 1,
  });
  expect(state.items.map((item) => item.status)).toEqual([
    "accepted",
    "rejected",
  ]);
  const rejectedInputJson = String(state.items[1]?.input_json ?? "");
  expect(rejectedInputJson.length).toBeLessThanOrEqual(
    MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH,
  );
  expect(JSON.parse(rejectedInputJson)).toMatchObject({
    truncated: true,
    originalType: "scalar",
    originalJsonLength: MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH + 5_002,
  });
});

test("rejects invalid JSON and more than 50 rows while preserving input", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  const textarea = dialog.getByLabel("Source posts JSON");

  await textarea.fill("[{invalid json]");
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Source text must be valid JSON",
  );
  await expect(textarea).toHaveValue("[{invalid json]");

  const tooManyRows = sourceJson(
    Array.from({ length: 51 }, (_, index) =>
      sourceRow(`row-${index}`, `Content ${index}`, `Author ${index}`),
    ),
  );
  await textarea.fill(tooManyRows);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Import up to 50 rows");
  await expect(textarea).toHaveValue(tooManyRows);

  const state = await getSourceImportState(page);
  expect(state.batches).toHaveLength(0);
  expect(state.candidates).toHaveLength(0);
});

test("keeps the latest campaign import history when an earlier load resolves last", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Import Campaign A");
  await createCampaign(page, "Import Campaign B");
  await openQueue(page);

  const campaignSelector = page.getByRole("combobox");
  await campaignSelector.selectOption({ label: "Import Campaign A" });
  let dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("campaign-a", "Campaign A source post", "Campaign A Author"),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await campaignSelector.selectOption({ label: "Import Campaign B" });
  dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("campaign-b", "Campaign B source post", "Campaign B Author"),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.evaluate(() => {
    const delayCampaignSelects = (
      window as unknown as {
        __LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__?: (campaignId: number) => void;
      }
    ).__LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__;
    delayCampaignSelects?.(1);
  });
  await campaignSelector.selectOption({ label: "Import Campaign A" });
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
  await campaignSelector.selectOption({ label: "Import Campaign B" });

  await expect(
    page.getByRole("heading", { name: "Campaign B Author" }),
  ).toBeVisible();
  await expect(page.getByText("Batch 2", { exact: true })).toBeVisible();
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
    page.getByRole("heading", { name: "Campaign B Author" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Campaign A Author" }),
  ).toBeHidden();
  await expect(page.getByText("Batch 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Batch 1", { exact: true })).toBeHidden();
});

test("archived campaigns block UI and data mutations while keeping history", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await page.evaluate(() => {
    const stateWindow = window as unknown as {
      __LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__?: () => void;
    };
    stateWindow.__LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__?.();
  });
  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("history", "Archived history post", "History Author"),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.evaluate(() => {
    const setStatus = (
      window as unknown as {
        __LINKGO_SQL_SET_CAMPAIGN_STATUS__?: (
          campaignId: number,
          status: string,
        ) => void;
      }
    ).__LINKGO_SQL_SET_CAMPAIGN_STATUS__;
    setStatus?.(1, "archived");
  });

  const archivedDialog = await openImportDialog(page);
  await archivedDialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([sourceRow("blocked", "Blocked archived row", "Blocked")]),
    );
  await archivedDialog.getByRole("button", { name: "Import posts" }).click();
  await expect(archivedDialog.getByRole("alert")).toHaveText(
    "Campaign is archived",
  );
  await archivedDialog.getByRole("button", { name: "Cancel" }).click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await openQueue(page);
  const importButton = page.getByRole("button", {
    name: "Import source posts",
  });
  await expect(importButton).toBeDisabled();
  await expect(page.getByText("Batch 1", { exact: true })).toBeVisible();

  const state = await getSourceImportState(page);
  expect(state.batches).toHaveLength(1);
  expect(state.candidates).toHaveLength(1);
});

test("a forced candidate failure rolls back only that row and records a safe failed batch", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_FAIL_CANDIDATE_INSERT_NUMBER__?: number }
    ).__LINKGO_FAIL_CANDIDATE_INSERT_NUMBER__ = 2;
  });

  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("accepted", "Accepted before failure", "Accepted Author"),
        sourceRow("failed", "This candidate insert fails", "Failed Author"),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import stopped", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("1 accepted, 0 duplicate, 1 rejected."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText(
      "Candidate could not be stored. Review the row and retry the import.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Injected candidate insert failure"),
  ).toBeHidden();

  const state = await getSourceImportState(page);
  expect(state.counts).toMatchObject({
    targetPosts: 1,
    candidatePosts: 1,
    dedupeKeys: 2,
    sourceImportBatches: 1,
    sourceImportItems: 2,
  });
  expect(state.batches[0]).toMatchObject({
    status: "failed",
    accepted_count: 1,
    rejected_count: 1,
    error_message: "Import stopped after a local storage error.",
  });
});

test("terminalizes the batch when an item outcome write fails", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_FAIL_SOURCE_IMPORT_ITEM_UPDATE_COUNT__?: number;
      }
    ).__LINKGO_FAIL_SOURCE_IMPORT_ITEM_UPDATE_COUNT__ = 1;
  });

  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        { url: "https://www.linkedin.com/posts/outcome-failure", content: "" },
        sourceRow(
          "skipped-after-outcome",
          "This row is not processed",
          "Later",
        ),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import stopped", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("0 accepted, 0 duplicate, 2 rejected."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText(
      "Candidate could not be stored. Review the row and retry the import.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Not processed because the import stopped after a local storage error.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Injected source import item update failure"),
  ).toBeHidden();

  const state = await getSourceImportState(page);
  expect(state.candidates).toHaveLength(0);
  expect(state.batches[0]).toMatchObject({
    status: "failed",
    accepted_count: 0,
    duplicate_count: 0,
    rejected_count: 2,
    error_message: "Import stopped after a local storage error.",
  });
  expect(state.items.map((item) => item.status)).toEqual([
    "rejected",
    "rejected",
  ]);
});

test("terminalizes the batch when the final batch outcome write fails", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_FAIL_SOURCE_IMPORT_BATCH_UPDATE_COUNT__?: number;
      }
    ).__LINKGO_FAIL_SOURCE_IMPORT_BATCH_UPDATE_COUNT__ = 1;
  });

  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("batch-outcome", "Accepted before batch write", "Accepted"),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import stopped", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("1 accepted, 0 duplicate, 0 rejected."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  const state = await getSourceImportState(page);
  expect(state.candidates).toHaveLength(1);
  expect(state.batches[0]).toMatchObject({
    status: "failed",
    accepted_count: 1,
    duplicate_count: 0,
    rejected_count: 0,
    error_message: "Import stopped after a local storage error.",
  });
  expect(state.items.map((item) => item.status)).toEqual(["accepted"]);
});

test("recovers a processing batch from a previous app session after reload", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await page.evaluate(() => {
    const stateWindow = window as unknown as {
      __LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__?: () => void;
      __LINKGO_SQL_CREATE_STALE_SOURCE_IMPORT__?: (
        campaignId: number,
        totalCount: number,
      ) => number;
    };
    stateWindow.__LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__?.();
    stateWindow.__LINKGO_SQL_CREATE_STALE_SOURCE_IMPORT__?.(1, 2);
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await openQueue(page);
  await expect(page.getByText("Batch 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Import stopped because the previous app session ended before processing finished.",
    ),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "Not processed because the previous app session ended before the import finished.",
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByText("Processing", { exact: true })).toBeHidden();
  await expect(page.getByText("Pending", { exact: true })).toBeHidden();

  const state = await getSourceImportState(page);
  expect(state.batches[0]).toMatchObject({
    status: "failed",
    accepted_count: 0,
    duplicate_count: 0,
    rejected_count: 2,
  });
  expect(state.items.map((item) => item.status)).toEqual([
    "rejected",
    "rejected",
  ]);
});

test("batch outcomes and reasons survive reload", async ({ page }) => {
  await openQueueWithCampaign(page);
  await page.evaluate(() => {
    const enable = (
      window as unknown as {
        __LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__?: () => void;
      }
    ).__LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__;
    enable?.();
  });

  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([
        sourceRow("reload", "Reload-safe valid row", "Reload Author"),
        { url: "https://www.linkedin.com/posts/reload-invalid", content: "" },
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await openQueue(page);
  await expect(page.getByText("Batch 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 accepted", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Post text: Post text is required", { exact: false }),
  ).toBeVisible();
});

test("keyboard flow returns focus and announces completion", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const trigger = page.getByRole("button", { name: "Import source posts" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Import source posts" });
  const textarea = dialog.getByLabel("Source posts JSON");
  await expect(textarea).toBeVisible();
  await expect(textarea).toHaveAttribute(
    "aria-describedby",
    /source-import-help/,
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await textarea.fill(
    sourceJson([
      sourceRow("keyboard", "Keyboard imported row", "Keyboard Author"),
    ]),
  );
  const submit = dialog.getByRole("button", { name: "Import posts" });
  await submit.focus();
  await page.keyboard.press("Enter");

  const status = dialog.getByTestId("source-import-result");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toContainText("1 accepted, 0 duplicate, 0 rejected.");
  const done = dialog.getByRole("button", { name: "Done" });
  await done.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

async function captureSourceImportVisualEvidence(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(4_500);
  await page
    .getByRole("heading", { name: "Recent source imports" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("source-import-desktop-1280x800.png"),
  });

  await page.setViewportSize({ width: 320, height: 800 });
  const trigger = page.getByRole("button", { name: "Import source posts" });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Import source posts" });
  await dialog
    .getByLabel("Source posts JSON")
    .fill(
      sourceJson([sourceRow("narrow", "Narrow dialog input", "Narrow Author")]),
    );
  await page.screenshot({
    path: testInfo.outputPath("source-import-narrow-dialog-320x800.png"),
  });
  await expectPageToReflow(page);
  await page.keyboard.press("Escape");
  await page
    .getByRole("heading", { name: "Recent source imports" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("source-import-narrow-history-320x800.png"),
  });
  await expectPageToReflow(page);

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectPageToReflow(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  await page.emulateMedia({ forcedColors: "active" });
  expect(
    await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
  ).toBe(true);
}

async function expectPageToReflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(
    dimensions.viewportWidth,
  );
}

function sourceRow(
  suffix: string,
  content: string,
  authorName: string,
): Record<string, unknown> {
  return {
    url: `https://www.linkedin.com/posts/source-${suffix}`,
    content,
    authorName,
    authorProfileUrl: `https://www.linkedin.com/in/${suffix}`,
    postedAt: "2026-07-27T10:00:00Z",
    platformResourceUrn: `urn:li:activity:${suffix}`,
    sourceKeyword: "approved source",
    notes: "Imported by Playwright",
  };
}

function sourceJson(rows: unknown[]): string {
  return JSON.stringify(rows, null, 2);
}

async function openQueueWithCampaign(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
}

async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();
}

async function openImportDialog(page: Page) {
  await page.getByRole("button", { name: "Import source posts" }).click();
  const dialog = page.getByRole("dialog", { name: "Import source posts" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createCampaign(
  page: Page,
  name = "Source import campaign",
): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Product").fill("Local LinkedIn operations");
  await dialog.getByLabel("Audience").fill("Operators");
  await dialog.getByLabel("Voice").fill("Concrete");
  await dialog.getByLabel("Tone").fill("Practical");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

interface SourceImportState {
  candidates: Array<Record<string, unknown>>;
  batches: Array<Record<string, unknown>>;
  items: Array<{ status: string } & Record<string, unknown>>;
  counts: Record<string, number>;
}

async function getSourceImportState(page: Page): Promise<SourceImportState> {
  return page.evaluate(() => {
    const stateWindow = window as unknown as {
      __LINKGO_SQL_CANDIDATE_POSTS__?: () => Array<Record<string, unknown>>;
      __LINKGO_SQL_SOURCE_IMPORT_BATCHES__?: () => Array<
        Record<string, unknown>
      >;
      __LINKGO_SQL_SOURCE_IMPORT_ITEMS__?: () => Array<
        { status: string } & Record<string, unknown>
      >;
      __LINKGO_SQL_STATE_COUNTS__?: () => Record<string, number>;
    };
    return {
      candidates: stateWindow.__LINKGO_SQL_CANDIDATE_POSTS__?.() ?? [],
      batches: stateWindow.__LINKGO_SQL_SOURCE_IMPORT_BATCHES__?.() ?? [],
      items: stateWindow.__LINKGO_SQL_SOURCE_IMPORT_ITEMS__?.() ?? [],
      counts: stateWindow.__LINKGO_SQL_STATE_COUNTS__?.() ?? {},
    };
  });
}
