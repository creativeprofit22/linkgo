import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH,
  MAX_SOURCE_IMPORT_REASON_LENGTH,
  MAX_SOURCE_IMPORT_ROWS,
  prepareSourceImportBatch,
  sourceImportFormRowsToRawRows,
} from "../src/features/source-imports/schemas";
import { setupTauriMocks } from "./helpers/tauri-mocks";
import { openSection } from "./helpers/navigation";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("imports two valid rows into candidates and a completed batch", async ({
  page,
}) => {
  await openQueueWithCampaign(page);

  const dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    formRow("one", "First imported source post", "Ada One"),
    formRow("two", "Second imported source post", "Ben Two"),
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import finished", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("2 added, 0 already saved, 0 skipped."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("heading", { name: "Ada One" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ben Two" })).toBeVisible();
  await expect(page.getByText("Import 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Done", { exact: true }).last()).toBeVisible();

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

test("guided import never asks for JSON and keeps optional details folded", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);

  await expect(dialog.getByText(/JSON/u)).toHaveCount(0);
  await expect(dialog.locator("pre, code")).toHaveCount(0);
  const row = dialog.getByTestId("source-import-row").first();
  await expect(row.getByLabel("Link", { exact: true })).toBeVisible();
  await expect(row.getByLabel("Post text", { exact: true })).toBeVisible();
  await expect(row.getByLabel("Post date", { exact: true })).toBeVisible();
  await expect(row.getByLabel("Author name")).toBeHidden();
  await row.getByText("More details (optional)").click();
  await expect(row.getByLabel("Author name")).toBeVisible();

  await dialog.getByRole("button", { name: "Add another post" }).click();
  await expect(dialog.getByTestId("source-import-row")).toHaveCount(2);
  await expect(
    dialog
      .getByTestId("source-import-row")
      .nth(1)
      .getByLabel("Link", { exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Remove post 2" }).click();
  await expect(dialog.getByTestId("source-import-row")).toHaveCount(1);
});

test("submitting an empty guided form explains what to add", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Add the link and text of at least one post.",
  );
  const state = await getSourceImportState(page);
  expect(state.batches).toHaveLength(0);
});

test("reports duplicate URL and content rows without extra candidates", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const duplicateContent = "The same imported source text.";
  const dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    formRow("duplicate", duplicateContent, "First Author"),
    formRow("duplicate", "Different text, same URL", "Second Author"),
    formRow("other-url", duplicateContent, "Third Author"),
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import finished. Some posts need a look"),
  ).toBeVisible();
  await expect(
    dialog.getByText("1 added, 2 already saved, 0 skipped."),
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
  await fillImportRows(dialog, [
    formRow("valid", "A valid source post", "Valid Author"),
    { ...formRow("no-link", "Text without a link", "No Link"), url: " " },
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("1 added, 0 already saved, 1 skipped."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByRole("heading", { name: "Valid Author" }),
  ).toBeVisible();
  await expect(
    page.getByText("Link: Add the LinkedIn post link", { exact: false }),
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

test("contract keeps field-specific reasons for over-long rows", () => {
  const prepared = prepareSourceImportBatch(1, [
    sourceRow("valid", "A valid source post", "Valid Author"),
    {
      url: " ",
      content: "x".repeat(3001),
      authorName: "a".repeat(161),
      authorProfileUrl: "p".repeat(1001),
      postedAt: "2".repeat(81),
    },
  ]);

  expect(prepared.connectorKey).toBe("local_json");
  expect(prepared.rows[0]?.validationError).toBe("");
  expect(prepared.rows[0]?.value).not.toBeNull();
  expect(prepared.rows[1]?.value).toBeNull();
  for (const field of ["Link", "Post text"]) {
    expect(prepared.rows[1]?.validationError).toContain(field);
  }
  expect(prepared.rows[1]?.validationError).toContain(
    "Add the LinkedIn post link",
  );
});

test("contract rejects empty and over-limit batches before writing", () => {
  expect(() => prepareSourceImportBatch(1, [])).toThrow();
  expect(() =>
    prepareSourceImportBatch(
      1,
      Array.from({ length: MAX_SOURCE_IMPORT_ROWS + 1 }, (_, index) =>
        sourceRow(`row-${index}`, `Content ${index}`, `Author ${index}`),
      ),
    ),
  ).toThrow("Import up to 50 posts at a time");
});

test("form rows map to contract rows without inventing data", () => {
  const [mapped, blankOptional] = sourceImportFormRowsToRawRows([
    {
      url: "https://www.linkedin.com/posts/source-map",
      content: "Mapped text",
      postedAt: "2026-07-20T14:30",
      authorName: "Map Author",
      authorProfileUrl: "https://www.linkedin.com/in/map",
      sourceKeyword: "founder content",
    },
    {
      url: "https://www.linkedin.com/posts/source-blank",
      content: "Blank optional fields",
      postedAt: "",
      authorName: "  ",
      authorProfileUrl: "",
      sourceKeyword: "",
    },
  ]);

  expect(mapped).toEqual({
    url: "https://www.linkedin.com/posts/source-map",
    content: "Mapped text",
    postedAt: new Date("2026-07-20T14:30").toISOString(),
    authorName: "Map Author",
    authorProfileUrl: "https://www.linkedin.com/in/map",
    sourceKeyword: "founder content",
  });
  expect(blankOptional).toEqual({
    url: "https://www.linkedin.com/posts/source-blank",
    content: "Blank optional fields",
    postedAt: null,
  });
});

test("bounds validation reasons while preserving valid neighboring rows", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const unexpectedFields = Object.fromEntries(
    Array.from({ length: 150 }, (_, index) => [
      `unexpected_field_${index}_${"x".repeat(24)}`,
      true,
    ]),
  );
  const result = await importContractRows(page, [
    sourceRow("reason-valid", "A valid neighboring row", "Valid Neighbor"),
    {
      ...sourceRow("reason-invalid", "Invalid unknown fields", "Invalid Row"),
      ...unexpectedFields,
    },
  ]);

  expect(result).toMatchObject({ acceptedCount: 1, rejectedCount: 1 });
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
  const result = await importContractRows(page, [
    sourceRow("bounded", "A valid bounded source post", "Bounded Author"),
    "x".repeat(MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH + 5_000),
  ]);

  expect(result).toMatchObject({
    status: "completed_with_errors",
    acceptedCount: 1,
    rejectedCount: 1,
  });

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

test("policy rejects unsafe sources and timestamp failures without writing candidate artifacts", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    formRow("policy-valid", "Safe neighboring post", "Safe Author"),
    {
      ...formRow("http", "HTTP source", "HTTP"),
      url: "http://www.linkedin.com/posts/http",
    },
    {
      ...formRow("other", "Other host", "Other"),
      url: "https://example.com/post",
    },
    { ...formRow("missing", "Missing timestamp", "Missing"), postedAt: null },
    {
      ...formRow("stale", "Stale post", "Stale"),
      postedAt: new Date(Date.now() - 31 * 86_400_000),
    },
    {
      ...formRow("future", "Future post", "Future"),
      postedAt: new Date(Date.now() + 60 * 60_000),
    },
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(
    dialog.getByText("1 added, 0 already saved, 5 skipped."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Filter: Link").first()).toBeVisible();
  await expect(page.getByText("Filter: Post age").first()).toBeVisible();

  const state = await getSourceImportState(page);
  expect(state.items.map((item) => item.policy_rule_key)).toEqual([
    "",
    "source",
    "source",
    "age",
    "age",
    "age",
  ]);
  expect(state.counts).toMatchObject({
    targetPosts: 1,
    candidatePosts: 1,
    dedupeKeys: 2,
  });
  expect(state.batches[0]).toMatchObject({
    status: "completed_with_errors",
    accepted_count: 1,
    rejected_count: 5,
  });
});

test("age policy accepts a post inside the exact configured boundary", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await setPolicy(page, "1", "");
  const dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    {
      ...formRow("boundary", "Boundary post", "Boundary"),
      // The form keeps minutes, so round up to stay inside the boundary.
      postedAt: ceilToMinute(new Date(Date.now() - 86_400_000 + 10_000)),
    },
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(
    dialog.getByText("1 added, 0 already saved, 0 skipped."),
  ).toBeVisible();
});

test("age policy allows five minutes of future clock skew", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    {
      ...formRow(
        "future-inside-allowance",
        "Future post inside clock-skew allowance",
        "Inside Allowance",
      ),
      postedAt: new Date(Date.now() + 4 * 60_000),
    },
    {
      ...formRow(
        "future-beyond-allowance",
        "Future post beyond clock-skew allowance",
        "Beyond Allowance",
      ),
      postedAt: new Date(Date.now() + 10 * 60_000),
    },
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(
    dialog.getByText("1 added, 0 already saved, 1 skipped."),
  ).toBeVisible();

  const state = await getSourceImportState(page);
  expect(state.items.map((item) => item.status)).toEqual([
    "accepted",
    "rejected",
  ]);
  expect(state.items.map((item) => item.policy_rule_key)).toEqual(["", "age"]);
  expect(state.candidates).toHaveLength(1);
});

test("age policy rejects date-only and calendar dates normalized by Date", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await setPolicy(page, "365", "");
  const now = new Date();
  const invalidYear =
    now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  const result = await importContractRows(page, [
    {
      ...sourceRow("invalid-calendar", "Invalid calendar date", "Calendar"),
      postedAt: `${invalidYear}-02-30T10:00:00Z`,
    },
    {
      ...sourceRow("invalid-time", "Invalid timestamp", "Invalid"),
      postedAt: "2026-07-27",
    },
  ]);

  expect(result).toMatchObject({ acceptedCount: 0, rejectedCount: 2 });
  const state = await getSourceImportState(page);
  expect(state.items.map((item) => item.policy_rule_key)).toEqual([
    "age",
    "age",
  ]);
  expect(state.candidates).toHaveLength(0);
});

test("banned topics use normalized whole-word and phrase matching", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await setPolicy(page, "30", "AI\nclimate change");
  const dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    formRow("substring", "She said the launch went well.", "Substring Safe"),
    formRow("ai", "Practical AI, governance guidance.", "AI Blocked"),
    {
      ...formRow("phrase", "A neutral update", "Phrase Blocked"),
      sourceKeyword: "CLIMATE   CHANGE",
    },
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(
    dialog.getByText("1 added, 0 already saved, 2 skipped."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Filter: Blocked topic").first()).toBeVisible();
  const state = await getSourceImportState(page);
  expect(state.items.map((item) => item.policy_rule_key)).toEqual([
    "",
    "banned_topic",
    "banned_topic",
  ]);
  expect(state.candidates).toHaveLength(1);
});

test("URL, URN, and normalized profile contacts block while failed and same-name contacts do not", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await page.evaluate(() => {
    const state = window as unknown as {
      __LINKGO_SQL_CREATE_CONTACT_ATTEMPT__?: (
        campaignId: number,
        identity: {
          normalizedUrl: string;
          platformResourceUrn?: string;
          authorProfileUrl?: string;
        },
        status?: "succeeded" | "failed",
      ) => void;
    };
    state.__LINKGO_SQL_CREATE_CONTACT_ATTEMPT__?.(1, {
      normalizedUrl: "https://www.linkedin.com/posts/contact-url",
    });
    state.__LINKGO_SQL_CREATE_CONTACT_ATTEMPT__?.(1, {
      normalizedUrl: "https://www.linkedin.com/posts/prior-urn",
      platformResourceUrn: "urn:li:activity:contact-urn",
    });
    state.__LINKGO_SQL_CREATE_CONTACT_ATTEMPT__?.(1, {
      normalizedUrl: "https://www.linkedin.com/posts/prior-profile",
      authorProfileUrl:
        "HTTPS://WWW.LINKEDIN.COM:443/in/contact-profile/?trk=prior#fragment",
    });
    state.__LINKGO_SQL_CREATE_CONTACT_ATTEMPT__?.(
      1,
      { normalizedUrl: "https://www.linkedin.com/posts/failed-contact" },
      "failed",
    );
  });
  const before = await getSourceImportState(page);
  const dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    {
      ...formRow("contact-url", "Same URL", "Different Name"),
      url: "https://www.linkedin.com/posts/contact-url",
    },
    {
      ...formRow("new-profile", "Same profile", "Different Name"),
      authorProfileUrl: "https://www.linkedin.com/in/contact-profile",
    },
    {
      ...formRow("failed-contact", "Failed contact can retry", "Prior contact"),
      url: "https://www.linkedin.com/posts/failed-contact",
    },
    formRow("same-name", "Same name alone is safe", "Prior contact"),
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(
    dialog.getByText("2 added, 0 already saved, 2 skipped."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText("Filter: Already contacted").first(),
  ).toBeVisible();

  // The form has no URN field; URN matching stays enforced on the contract.
  await importContractRows(page, [
    {
      ...sourceRow("new-urn", "Same URN", "Different Name"),
      platformResourceUrn: "urn:li:activity:contact-urn",
    },
  ]);

  const after = await getSourceImportState(page);
  expect(after.items.map((item) => item.policy_rule_key)).toEqual([
    "already_contacted",
    "already_contacted",
    "",
    "",
    "already_contacted",
  ]);
  expect(
    (after.counts.candidatePosts ?? 0) - (before.counts.candidatePosts ?? 0),
  ).toBe(2);
  await expect(page.getByRole("button", { name: "Add idea" })).toBeEnabled();
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "skip these filters",
  );
});

test("caps the guided form at 50 posts and explains the limit", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  const addRow = dialog.getByRole("button", { name: "Add another post" });

  for (let index = 1; index < MAX_SOURCE_IMPORT_ROWS; index += 1) {
    await addRow.click();
  }
  await expect(dialog.getByTestId("source-import-row")).toHaveCount(50);
  await expect(addRow).toBeDisabled();
  await expect(addRow).toHaveAccessibleDescription(
    "You can import up to 50 posts at a time. Import these, then add more.",
  );

  const state = await getSourceImportState(page);
  expect(state.batches).toHaveLength(0);
  expect(state.candidates).toHaveLength(0);
});

test("keeps typed rows when the import is refused", async ({ page }) => {
  await openQueueWithCampaign(page);
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_SQL_SET_CAMPAIGN_STATUS__?: (
          campaignId: number,
          status: string,
        ) => void;
      }
    ).__LINKGO_SQL_SET_CAMPAIGN_STATUS__?.(1, "archived");
  });
  const dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    formRow("kept", "Typed text survives", "Kept Author"),
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Campaign is archived");
  const row = dialog.getByTestId("source-import-row").first();
  await expect(row.getByLabel("Link", { exact: true })).toHaveValue(
    "https://www.linkedin.com/posts/source-kept",
  );
  await expect(row.getByLabel("Post text", { exact: true })).toHaveValue(
    "Typed text survives",
  );
});

test("keeps the latest campaign import history when an earlier load resolves last", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Import Campaign A");
  await createCampaign(page, "Import Campaign B");
  await openQueue(page);

  const campaignSelector = page.getByRole("combobox");
  await campaignSelector.selectOption({ label: "Import Campaign A" });
  let dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    formRow("campaign-a", "Campaign A source post", "Campaign A Author"),
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await campaignSelector.selectOption({ label: "Import Campaign B" });
  dialog = await openImportDialog(page);
  await fillImportRows(dialog, [
    formRow("campaign-b", "Campaign B source post", "Campaign B Author"),
  ]);
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
  await expect(page.getByText("Import 2", { exact: true })).toBeVisible();
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
  await expect(page.getByText("Import 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Import 1", { exact: true })).toBeHidden();
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
  await fillImportRows(dialog, [
    formRow("history", "Archived history post", "History Author"),
  ]);
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
  await fillImportRows(archivedDialog, [
    formRow("blocked", "Blocked archived row", "Blocked"),
  ]);
  await archivedDialog.getByRole("button", { name: "Import posts" }).click();
  await expect(archivedDialog.getByRole("alert")).toHaveText(
    "Campaign is archived",
  );
  await archivedDialog.getByRole("button", { name: "Cancel" }).click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await openQueue(page);
  const importButton = page.getByRole("button", {
    name: "Import posts",
  });
  await expect(importButton).toBeDisabled();
  await expect(page.getByText("Import 1", { exact: true })).toBeVisible();

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
  await fillImportRows(dialog, [
    formRow("accepted", "Accepted before failure", "Accepted Author"),
    formRow("failed", "This candidate insert fails", "Failed Author"),
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import stopped", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("1 added, 0 already saved, 1 skipped."),
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
  await fillImportRows(dialog, [
    { url: "https://www.linkedin.com/posts/outcome-failure", content: "" },
    formRow("skipped-after-outcome", "This row is not processed", "Later"),
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import stopped", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("0 added, 0 already saved, 2 skipped."),
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
  await fillImportRows(dialog, [
    formRow("batch-outcome", "Accepted before batch write", "Accepted"),
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import stopped", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("1 added, 0 already saved, 0 skipped."),
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
  await expect(page.getByText("Import 1", { exact: true })).toBeVisible();
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
  await expect(page.getByText("In progress", { exact: true })).toBeHidden();
  await expect(page.getByText("Not checked yet", { exact: true })).toBeHidden();

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
  await fillImportRows(dialog, [
    formRow("reload", "Reload-safe valid row", "Reload Author"),
    { url: "https://www.linkedin.com/posts/reload-invalid", content: "" },
  ]);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await openQueue(page);
  await expect(page.getByText("Import 1", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 added", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Post text: Add the post text", { exact: false }),
  ).toBeVisible();
});

test("keyboard flow returns focus and announces completion", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const trigger = page.getByRole("button", { name: "Import posts" });
  await trigger.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Import posts" });
  const linkInput = dialog.getByLabel("Link", { exact: true });
  await expect(linkInput).toBeVisible();
  await expect(linkInput).toHaveAttribute(
    "aria-describedby",
    /source-import-url-hint-/u,
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Enter");
  await fillImportRows(dialog, [
    formRow("keyboard", "Keyboard imported row", "Keyboard Author"),
  ]);
  const submit = dialog.getByRole("button", { name: "Import posts" });
  await submit.focus();
  await page.keyboard.press("Enter");

  const status = dialog.getByTestId("source-import-result");
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toContainText("1 added, 0 already saved, 0 skipped.");
  const done = dialog.getByRole("button", { name: "Done" });
  await done.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("keeps source-import controls operable with reduced motion and forced colors", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await page.emulateMedia({ reducedMotion: "reduce" });

  const trigger = page.getByRole("button", { name: "Import posts" });
  const dialog = await openImportDialog(page);
  const linkInput = dialog.getByLabel("Link", { exact: true });
  const addRow = dialog.getByRole("button", { name: "Add another post" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const submit = dialog.getByRole("button", { name: "Import posts" });
  const close = dialog.getByRole("button", { name: "Close" });

  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  await fillImportRows(dialog, [
    {
      ...formRow("forced-colors", "Rejected source", "Policy Author"),
      url: "http://www.linkedin.com/posts/forced-colors",
    },
  ]);
  await submit.click();
  await expect(
    dialog.getByText("0 added, 0 already saved, 1 skipped."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const policyLabel = page.getByText("Filter: Link").first();
  await expect(policyLabel).toBeVisible();

  await page.emulateMedia({
    reducedMotion: "reduce",
    forcedColors: "active",
  });
  expect(
    await page.evaluate(() => matchMedia("(forced-colors: active)").matches),
  ).toBe(true);

  const batchSummary = page.locator("summary").filter({ hasText: "Import 1" });
  await expect(batchSummary).toBeVisible();
  await expectForcedColorsFocusIndicator(batchSummary);
  await page.keyboard.press("Enter");
  await expect(policyLabel).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(policyLabel).toBeVisible();

  await expectForcedColorsFocusIndicator(trigger);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await fillImportRows(dialog, [
    formRow("forced-colors-valid", "Visible controls", "Control Author"),
  ]);

  for (const control of [close, linkInput, addRow, cancel, submit]) {
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
    await expectForcedColorsFocusIndicator(control);
  }

  await cancel.click();
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
    .getByRole("heading", { name: "Recent imports" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("source-import-desktop-1280x800.png"),
  });

  await page.setViewportSize({ width: 320, height: 800 });
  const trigger = page.getByRole("button", { name: "Import posts" });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Import posts" });
  await fillImportRows(dialog, [
    formRow("narrow", "Narrow dialog input", "Narrow Author"),
  ]);
  await page.screenshot({
    path: testInfo.outputPath("source-import-narrow-dialog-320x800.png"),
  });
  await expectPageToReflow(page);
  await page.keyboard.press("Escape");
  await page
    .getByRole("heading", { name: "Recent imports" })
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
}
async function expectForcedColorsFocusIndicator(
  locator: Locator,
): Promise<void> {
  const unfocused = await locator.evaluate(readFocusIndicatorStyles);
  await locator.focus();
  await locator.page().keyboard.press("Shift+Tab");
  await locator.page().keyboard.press("Tab");
  await expect(locator).toBeFocused();
  const focused = await locator.evaluate(readFocusIndicatorStyles);

  expect(focused.focusVisible).toBe(true);
  expect(
    focused.hasOutline ||
      focused.boxShadow !== "none" ||
      focused.borderColor !== unfocused.borderColor,
  ).toBe(true);
}

function readFocusIndicatorStyles(element: Element): {
  borderColor: string;
  boxShadow: string;
  focusVisible: boolean;
  hasOutline: boolean;
} {
  const style = getComputedStyle(element);
  return {
    borderColor: style.borderColor,
    boxShadow: style.boxShadow,
    focusVisible: element.matches(":focus-visible"),
    hasOutline:
      style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
  };
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
    postedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    platformResourceUrn: `urn:li:activity:${suffix}`,
    sourceKeyword: "approved source",
    notes: "Imported by Playwright",
  };
}

/**
 * Writes rows through the same contract preparation and native command the
 * app uses, for row shapes the guided form cannot produce (URNs, unknown
 * fields, scalars, raw timestamp strings).
 */
async function importContractRows(
  page: Page,
  rows: unknown[],
): Promise<Record<string, unknown>> {
  const prepared = prepareSourceImportBatch(1, rows);
  return page.evaluate((input) => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    if (internals === undefined) throw new Error("Tauri mocks unavailable");
    return internals.invoke("linkgo_source_import_write_batch", {
      input,
    }) as Promise<Record<string, unknown>>;
  }, prepared);
}

/** Rounds up to the next whole minute (the form's date input keeps minutes). */
function ceilToMinute(date: Date): Date {
  return new Date(Math.ceil(date.getTime() / 60_000) * 60_000);
}

interface ImportFormRowInput {
  url: string;
  content: string;
  /** A Date is typed in local time; `null` leaves the date empty. */
  postedAt?: string | Date | null;
  authorName?: string;
  authorProfileUrl?: string;
  sourceKeyword?: string;
}

/** A guided-form row; `postedAt` is a `datetime-local` value one day ago. */
function formRow(
  suffix: string,
  content: string,
  authorName: string,
): ImportFormRowInput {
  return {
    url: `https://www.linkedin.com/posts/source-${suffix}`,
    content,
    authorName,
    authorProfileUrl: `https://www.linkedin.com/in/${suffix}`,
    postedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    sourceKeyword: "approved source",
  };
}

function toDateTimeLocal(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Fills the guided import form, adding rows as needed. */
async function fillImportRows(
  dialog: Locator,
  rows: readonly ImportFormRowInput[],
): Promise<void> {
  const rowLocators = dialog.getByTestId("source-import-row");
  for (const [index, row] of rows.entries()) {
    if ((await rowLocators.count()) <= index) {
      await dialog.getByRole("button", { name: "Add another post" }).click();
      // Adding a row moves focus to its Link field on the next frame; wait
      // for it so that deferred focus cannot steal a later field's typing.
      await expect(
        rowLocators.nth(index).getByLabel("Link", { exact: true }),
      ).toBeFocused();
    }
    const rowLocator = rowLocators.nth(index);
    await rowLocator.getByLabel("Link", { exact: true }).fill(row.url);
    await rowLocator.getByLabel("Post text", { exact: true }).fill(row.content);
    await rowLocator
      .getByLabel("Post date", { exact: true })
      .fill(
        row.postedAt instanceof Date
          ? toDateTimeLocal(row.postedAt)
          : (row.postedAt ?? ""),
      );
    const optional = [
      ["Author name", row.authorName],
      ["Author profile link", row.authorProfileUrl],
      ["Where you found it", row.sourceKeyword],
    ] as const;
    if (optional.some(([, value]) => value)) {
      const disclosure = rowLocator.locator("details");
      if ((await disclosure.getAttribute("open")) === null) {
        await rowLocator.getByText("More details (optional)").click();
      }
      for (const [label, value] of optional) {
        if (value) await rowLocator.getByLabel(label).fill(value);
      }
    }
  }
}

async function openQueueWithCampaign(page: Page): Promise<void> {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
}

async function openQueue(page: Page): Promise<void> {
  await openSection(page, "Create", "Ideas");
  await expect(
    page.getByRole("heading", { name: "Ideas", exact: true }),
  ).toBeVisible();
}

async function setPolicy(
  page: Page,
  age: string,
  topics: string,
): Promise<void> {
  await page.getByRole("button", { name: "Edit filters" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit idea filters",
  });
  await dialog.getByLabel("Oldest post to keep (days)").fill(age);
  await dialog.getByLabel("Blocked topics").fill(topics);
  await dialog.getByRole("button", { name: "Save filters" }).click();
  await expect(dialog).toBeHidden();
}

async function openImportDialog(page: Page) {
  await page.getByRole("button", { name: "Import posts" }).click();
  const dialog = page.getByRole("dialog", { name: "Import posts" });
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
