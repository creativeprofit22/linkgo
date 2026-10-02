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
    .getByLabel("Posts (JSON)")
    .fill(
      sourceJson([
        sourceRow("one", "First imported source post", "Ada One"),
        sourceRow("two", "Second imported source post", "Ben Two"),
      ]),
    );
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

test("reports duplicate URL and content rows without extra candidates", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const duplicateContent = "The same imported source text.";
  const dialog = await openImportDialog(page);
  await dialog
    .getByLabel("Posts (JSON)")
    .fill(
      sourceJson([
        sourceRow("duplicate", duplicateContent, "First Author"),
        sourceRow("duplicate", "Different text, same URL", "Second Author"),
        sourceRow("other-url", duplicateContent, "Third Author"),
      ]),
    );
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
  await dialog.getByLabel("Posts (JSON)").fill(
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
  await dialog.getByLabel("Posts (JSON)").fill(
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
    dialog.getByText("1 added, 0 already saved, 1 skipped."),
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
    .getByLabel("Posts (JSON)")
    .fill(
      sourceJson([
        sourceRow("bounded", "A valid bounded source post", "Bounded Author"),
        "x".repeat(MAX_SOURCE_IMPORT_INPUT_JSON_LENGTH + 5_000),
      ]),
    );
  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("Import finished. Some posts need a look"),
  ).toBeVisible();
  await expect(
    dialog.getByText("1 added, 0 already saved, 1 skipped."),
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

test("policy rejects unsafe sources and timestamp failures without writing candidate artifacts", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const valid = sourceRow(
    "policy-valid",
    "Safe neighboring post",
    "Safe Author",
  );
  const stale = {
    ...sourceRow("stale", "Stale post", "Stale"),
    postedAt: new Date(Date.now() - 31 * 86_400_000).toISOString(),
  };
  const future = {
    ...sourceRow("future", "Future post", "Future"),
    postedAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  };
  const dialog = await openImportDialog(page);
  await dialog.getByLabel("Posts (JSON)").fill(
    sourceJson([
      valid,
      {
        ...sourceRow("http", "HTTP source", "HTTP"),
        url: "http://www.linkedin.com/posts/http",
      },
      {
        ...sourceRow("other", "Other host", "Other"),
        url: "https://example.com/post",
      },
      {
        ...sourceRow("missing", "Missing timestamp", "Missing"),
        postedAt: null,
      },
      {
        ...sourceRow("invalid-time", "Invalid timestamp", "Invalid"),
        postedAt: "2026-07-27",
      },
      stale,
      future,
    ]),
  );
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(
    dialog.getByText("1 added, 0 already saved, 6 skipped."),
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
    rejected_count: 6,
  });
});

test("age policy accepts a post inside the exact configured boundary", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await setPolicy(page, "1", "");
  const dialog = await openImportDialog(page);
  await dialog.getByLabel("Posts (JSON)").fill(
    sourceJson([
      {
        ...sourceRow("boundary", "Boundary post", "Boundary"),
        postedAt: new Date(Date.now() - 86_400_000 + 10_000).toISOString(),
      },
    ]),
  );
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
  await dialog.getByLabel("Posts (JSON)").fill(
    sourceJson([
      {
        ...sourceRow(
          "future-inside-allowance",
          "Future post inside clock-skew allowance",
          "Inside Allowance",
        ),
        postedAt: new Date(Date.now() + 4 * 60_000).toISOString(),
      },
      {
        ...sourceRow(
          "future-beyond-allowance",
          "Future post beyond clock-skew allowance",
          "Beyond Allowance",
        ),
        postedAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    ]),
  );
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

test("age policy rejects calendar dates normalized by Date", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await setPolicy(page, "365", "");
  const now = new Date();
  const invalidYear =
    now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const dialog = await openImportDialog(page);
  await dialog.getByLabel("Posts (JSON)").fill(
    sourceJson([
      {
        ...sourceRow("invalid-calendar", "Invalid calendar date", "Calendar"),
        postedAt: `${invalidYear}-02-30T10:00:00Z`,
      },
    ]),
  );

  await dialog.getByRole("button", { name: "Import posts" }).click();

  await expect(
    dialog.getByText("0 added, 0 already saved, 1 skipped."),
  ).toBeVisible();
  const state = await getSourceImportState(page);
  expect(state.items[0]?.policy_rule_key).toBe("age");
  expect(state.candidates).toHaveLength(0);
});

test("banned topics use normalized whole-word and phrase matching", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await setPolicy(page, "30", "AI\nclimate change");
  const dialog = await openImportDialog(page);
  await dialog.getByLabel("Posts (JSON)").fill(
    sourceJson([
      sourceRow(
        "substring",
        "She said the launch went well.",
        "Substring Safe",
      ),
      sourceRow("ai", "Practical AI, governance guidance.", "AI Blocked"),
      {
        ...sourceRow("phrase", "A neutral update", "Phrase Blocked"),
        sourceKeyword: "CLIMATE   CHANGE",
      },
    ]),
  );
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
  await dialog.getByLabel("Posts (JSON)").fill(
    sourceJson([
      {
        ...sourceRow("contact-url", "Same URL", "Different Name"),
        url: "https://www.linkedin.com/posts/contact-url",
      },
      {
        ...sourceRow("new-urn", "Same URN", "Different Name"),
        platformResourceUrn: "urn:li:activity:contact-urn",
      },
      {
        ...sourceRow("new-profile", "Same profile", "Different Name"),
        authorProfileUrl: "https://www.linkedin.com/in/contact-profile",
      },
      {
        ...sourceRow(
          "failed-contact",
          "Failed contact can retry",
          "Prior contact",
        ),
        url: "https://www.linkedin.com/posts/failed-contact",
      },
      {
        ...sourceRow("same-name", "Same name alone is safe", "Prior contact"),
      },
    ]),
  );
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(
    dialog.getByText("2 added, 0 already saved, 3 skipped."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText("Filter: Already contacted").first(),
  ).toBeVisible();
  const after = await getSourceImportState(page);
  expect(after.items.map((item) => item.policy_rule_key)).toEqual([
    "already_contacted",
    "already_contacted",
    "already_contacted",
    "",
    "",
  ]);
  expect(after.counts.candidatePosts - before.counts.candidatePosts).toBe(2);
  expect(page.getByRole("button", { name: "Add idea" })).toBeEnabled();
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "skip these filters",
  );
});

test("rejects invalid JSON and more than 50 rows while preserving input", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openImportDialog(page);
  const textarea = dialog.getByLabel("Posts (JSON)");

  await textarea.fill("[{invalid json]");
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "This doesn't look like a valid JSON list. Check it matches the example.",
  );
  await expect(textarea).toHaveValue("[{invalid json]");

  const tooManyRows = sourceJson(
    Array.from({ length: 51 }, (_, index) =>
      sourceRow(`row-${index}`, `Content ${index}`, `Author ${index}`),
    ),
  );
  await textarea.fill(tooManyRows);
  await dialog.getByRole("button", { name: "Import posts" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Import up to 50 posts at a time",
  );
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
    .getByLabel("Posts (JSON)")
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
    .getByLabel("Posts (JSON)")
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
  await dialog
    .getByLabel("Posts (JSON)")
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
    .getByLabel("Posts (JSON)")
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
  await dialog
    .getByLabel("Posts (JSON)")
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
  await dialog
    .getByLabel("Posts (JSON)")
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
  await dialog
    .getByLabel("Posts (JSON)")
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
  await dialog
    .getByLabel("Posts (JSON)")
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
  const textarea = dialog.getByLabel("Posts (JSON)");
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
  const textarea = dialog.getByLabel("Posts (JSON)");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const submit = dialog.getByRole("button", { name: "Import posts" });
  const close = dialog.getByRole("button", { name: "Close" });

  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  await textarea.fill(
    sourceJson([
      {
        ...sourceRow("forced-colors", "Rejected source", "Policy Author"),
        url: "http://www.linkedin.com/posts/forced-colors",
      },
    ]),
  );
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
  await textarea.fill(
    sourceJson([
      sourceRow("forced-colors-valid", "Visible controls", "Control Author"),
    ]),
  );

  for (const control of [close, textarea, cancel, submit]) {
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
  await dialog
    .getByLabel("Posts (JSON)")
    .fill(
      sourceJson([sourceRow("narrow", "Narrow dialog input", "Narrow Author")]),
    );
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

function sourceJson(rows: unknown[]): string {
  return JSON.stringify(rows, null, 2);
}

async function openQueueWithCampaign(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
}

async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Ideas/ }).click();
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
