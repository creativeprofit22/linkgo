import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { setupTauriMocks } from "./helpers/tauri-mocks";

test.use({ timezoneId: "America/New_York" });

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("creates Operator and Linkgo work and filters the visible owner", async ({
  page,
}) => {
  await openBacklogWithCampaign(page, "Launch campaign");
  await createBacklogItem(page, {
    title: "Review launch research",
    workType: "Research",
    owner: "You",
    recurrence: "One time",
    dueAt: futureLocalDateTime(2),
  });
  await createBacklogItem(page, {
    title: "Prepare launch scoring",
    workType: "Scoring",
    owner: "Linkgo",
    recurrence: "Weekly",
    dueAt: futureLocalDateTime(4),
  });

  await expect(
    page.getByRole("heading", { name: "Review launch research" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Prepare launch scoring" }),
  ).toBeVisible();
  await expect(page.getByText("Research", { exact: true })).toBeVisible();
  await expect(page.getByText("Scoring", { exact: true })).toBeVisible();
  await expect(page.getByText("You", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Linkgo", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Weekly", { exact: true })).toBeVisible();
  await expect(page.getByText(/America\/New_York/)).toBeVisible();
  const recurringRow = (await getBacklogState(page)).find(
    (row) => row.title === "Prepare launch scoring",
  );
  expect(recurringRow?.recurrence_timezone).toBe("America/New_York");

  await page.getByLabel("Owner", { exact: true }).selectOption("operator");
  await expect(
    page.getByRole("heading", { name: "Review launch research" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Prepare launch scoring" }),
  ).toBeHidden();
  await page.getByLabel("Owner", { exact: true }).selectOption("linkgo");
  await expect(
    page.getByRole("heading", { name: "Prepare launch scoring" }),
  ).toBeVisible();
  await expect(page.getByText(/You marked Linkgo as the owner/u)).toBeVisible();
});

test("enforces lifecycle transitions through UI and the direct data boundary", async ({
  page,
}) => {
  await openBacklogWithCampaign(page, "Lifecycle campaign");
  await createBacklogItem(page, {
    title: "Move through lifecycle",
    dueAt: futureLocalDateTime(1),
  });

  const item = () =>
    page.getByRole("heading", { name: "Move through lifecycle" });
  const itemCard = () =>
    item().locator(
      "xpath=ancestor::div[contains(@class,'overflow-hidden')][1]",
    );
  await itemCard().getByRole("button", { name: "Start" }).click();
  await expect(
    itemCard().getByText("In progress", { exact: true }),
  ).toBeVisible();
  await itemCard().getByRole("button", { name: "Put on hold" }).click();
  await expect(itemCard().getByText("On hold", { exact: true })).toBeVisible();
  await itemCard().getByRole("button", { name: "Continue" }).click();
  await expect(
    itemCard().getByText("In progress", { exact: true }),
  ).toBeVisible();
  await itemCard().getByRole("button", { name: "Complete" }).click();
  await expect(item()).toBeHidden();

  await page.getByLabel("View").selectOption("history");
  await expect(item()).toBeVisible();
  await expect(page.getByText("Done", { exact: true })).toBeVisible();

  const completedRows = await getBacklogState(page);
  const invalidTransitionError = await callBacklogApi(
    page,
    "setCampaignBacklogItemStatus",
    {
      id: Number(completedRows[0]?.id ?? 0),
      status: "pending",
    },
  );
  expect(invalidTransitionError).toContain("final");
});

test("keeps recurring wall-clock time across DST boundaries", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => "__LINKGO_CAMPAIGN_BACKLOG_TEST_API__" in window,
  );
  const results = await page.evaluate(() => {
    const api = (
      window as unknown as {
        __LINKGO_CAMPAIGN_BACKLOG_TEST_API__?: BacklogTestApi;
      }
    ).__LINKGO_CAMPAIGN_BACKLOG_TEST_API__;
    return {
      spring: api?.getNextCampaignBacklogDueAt(
        "2026-03-07T14:00:00.000Z",
        "daily",
        "America/New_York",
        new Date("2026-03-07T15:00:00.000Z"),
      ),
      fall: api?.getNextCampaignBacklogDueAt(
        "2026-10-31T05:30:00.000Z",
        "daily",
        "America/New_York",
        new Date("2026-10-31T06:00:00.000Z"),
      ),
      nonexistent: api?.getNextCampaignBacklogDueAt(
        "2026-03-07T07:30:00.000Z",
        "daily",
        "America/New_York",
        new Date("2026-03-07T08:00:00.000Z"),
      ),
    };
  });
  expect(results.spring).toBe("2026-03-08T13:00:00.000Z");
  expect(results.fall).toBe("2026-11-01T05:30:00.000Z");
  expect(results.nonexistent).toBe("2026-03-08T07:30:00.000Z");
});

test("coalesces recurring completion and rolls back a failed successor", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Recurring campaign");
  await seedBacklogItems(page, [
    {
      campaign_id: 1,
      title: "Overdue daily review",
      due_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      recurrence: "daily",
    },
    {
      campaign_id: 1,
      title: "Overdue weekly review",
      due_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      recurrence: "weekly",
    },
    {
      campaign_id: 1,
      title: "Rollback recurring review",
      due_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      recurrence: "daily",
    },
  ]);
  await openBacklog(page);

  await completeItem(page, "Overdue daily review", false);
  await expect(
    page.getByText("Next repeating task scheduled").last(),
  ).toBeVisible();
  await completeItem(page, "Overdue weekly review", false);
  await expect(
    page.getByText("Next repeating task scheduled").last(),
  ).toBeVisible();
  let rows = await getBacklogState(page);
  for (const title of ["Overdue daily review", "Overdue weekly review"]) {
    const matching = rows.filter((row) => row.title === title);
    expect(matching).toHaveLength(2);
    expect(matching.filter((row) => row.status === "completed")).toHaveLength(
      1,
    );
    const successor = matching.find((row) => row.status === "pending");
    expect(Date.parse(String(successor?.due_at))).toBeGreaterThan(Date.now());
    expect(successor?.recurrence_parent_id).toBe(
      matching.find((row) => row.status === "completed")?.id,
    );
  }

  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_FAIL_BACKLOG_SUCCESSOR__?: boolean }
    ).__LINKGO_FAIL_BACKLOG_SUCCESSOR__ = true;
  });
  await completeItem(page, "Rollback recurring review", false);
  await expect(
    page.getByText("Injected recurring successor failure"),
  ).toBeVisible();
  rows = await getBacklogState(page);
  const rollbackRows = rows.filter(
    (row) => row.title === "Rollback recurring review",
  );
  expect(rollbackRows).toHaveLength(1);
  expect(rollbackRows[0]?.status).toBe("pending");
});

test("confirms recurring cancellation and creates no successor", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Cancellation campaign");
  await seedBacklogItems(page, [
    {
      campaign_id: 1,
      title: "Stop recurring metrics",
      recurrence: "weekly",
      work_type: "metrics",
    },
  ]);
  await openBacklog(page);

  await page.getByRole("button", { name: "Cancel" }).click();
  const dialog = page.getByRole("dialog", {
    name: /Cancel “Stop recurring metrics”/,
  });
  await expect(dialog).toContainText("stops the weekly repeat");
  await dialog.getByRole("button", { name: "Cancel task" }).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel("View").selectOption("history");
  await expect(
    page.getByRole("heading", { name: "Stop recurring metrics" }),
  ).toBeVisible();

  const rows = (await getBacklogState(page)).filter(
    (row) => row.title === "Stop recurring metrics",
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]?.status).toBe("cancelled");
});

test("wires create and edit validation errors to their invalid controls", async ({
  page,
}) => {
  await openBacklogWithCampaign(page, "Accessible validation campaign");
  const createDialog = await openCreateDialog(page);
  await createDialog
    .getByLabel("Details")
    .fill("Keep this context through validation.");
  await createDialog.getByLabel("Due time").fill("");
  await createDialog.getByRole("button", { name: "Create task" }).click();

  await expectFieldValidation(
    createDialog,
    "Title",
    "backlog-title-error",
    "Add a title",
  );
  await expectFieldValidation(
    createDialog,
    "Due time",
    "backlog-due-at-error",
    "Enter a valid date and time",
  );
  await expect(createDialog.getByLabel("Details")).toHaveValue(
    "Keep this context through validation.",
  );

  const createTitle = createDialog.getByLabel("Title");
  const createDueTime = createDialog.getByLabel("Due time");
  await createTitle.fill("Accessible validation item");
  await expectFieldValidationToClear(createTitle);
  await createDueTime.fill(futureLocalDateTime(3));
  await expectFieldValidationToClear(createDueTime);
  await createDialog.getByRole("button", { name: "Create task" }).click();
  await expect(createDialog).toBeHidden();

  const heading = page.getByRole("heading", {
    name: "Accessible validation item",
  });
  const card = heading.locator(
    "xpath=ancestor::div[contains(@class,'overflow-hidden')][1]",
  );
  await card.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit task" });
  await editDialog.getByLabel("Title").fill("");
  await editDialog.getByLabel("Due time").fill("");
  await editDialog.getByRole("button", { name: "Save changes" }).click();

  await expectFieldValidation(
    editDialog,
    "Title",
    "backlog-title-error",
    "Add a title",
  );
  await expectFieldValidation(
    editDialog,
    "Due time",
    "backlog-due-at-error",
    "Enter a valid date and time",
  );
  await expect(editDialog.getByLabel("Details")).toHaveValue(
    "Keep this context through validation.",
  );

  const editTitle = editDialog.getByLabel("Title");
  const editDueTime = editDialog.getByLabel("Due time");
  await editTitle.fill("Accessible validation item updated");
  await expectFieldValidationToClear(editTitle);
  await editDueTime.fill(futureLocalDateTime(4));
  await expectFieldValidationToClear(editDueTime);
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(editDialog).toBeHidden();
});

test("preserves form values, reports storage failure, and prevents duplicate creation", async ({
  page,
}) => {
  await openBacklogWithCampaign(page, "Validation campaign");
  const dialog = await openCreateDialog(page);
  await dialog
    .getByLabel("Details")
    .fill("Keep this context after validation.");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog.getByText("Add a title")).toBeVisible();
  await expect(dialog.getByLabel("Details")).toHaveValue(
    "Keep this context after validation.",
  );

  await dialog.getByLabel("Title").fill("Storage failure item");
  await dialog.getByLabel("Due time").fill(futureLocalDateTime(3));
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_FAIL_BACKLOG_INSERT__?: boolean }
    ).__LINKGO_FAIL_BACKLOG_INSERT__ = true;
  });
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(
    dialog.getByText("Injected backlog insert failure"),
  ).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("Storage failure item");
  await expect(dialog.getByLabel("Details")).toHaveValue(
    "Keep this context after validation.",
  );

  await dialog.getByRole("button", { name: "Create task" }).dblclick();
  await expect(dialog).toBeHidden();
  const rows = (await getBacklogState(page)).filter(
    (row) => row.title === "Storage failure item",
  );
  expect(rows).toHaveLength(1);
});

test("does not report a committed create as failed when refresh reads fail", async ({
  page,
}) => {
  await openBacklogWithCampaign(page, "Post-commit read campaign");
  const dialog = await openCreateDialog(page);
  await dialog.getByLabel("Title").fill("Committed before refresh failure");
  await dialog.getByLabel("Due time").fill(futureLocalDateTime(3));
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_FAIL_BACKLOG_SELECT__?: boolean }
    ).__LINKGO_FAIL_BACKLOG_SELECT__ = true;
  });

  await dialog.getByRole("button", { name: "Create task" }).click();

  await expect(dialog).toBeHidden();
  const rows = (await getBacklogState(page)).filter(
    (row) => row.title === "Committed before refresh failure",
  );
  expect(rows).toHaveLength(1);
});

test("keeps archived campaign history readable and rejects every mutation", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Archived campaign");
  const now = new Date().toISOString();
  await seedBacklogItems(page, [
    {
      campaign_id: 1,
      title: "Archived completed work",
      status: "completed",
      completed_at: now,
    },
    {
      campaign_id: 1,
      title: "Archived open work",
      status: "pending",
    },
  ]);
  await page.evaluate(() => {
    const state = window as unknown as {
      __LINKGO_SQL_SET_CAMPAIGN_STATUS__?: (id: number, status: string) => void;
    };
    state.__LINKGO_SQL_SET_CAMPAIGN_STATUS__?.(1, "archived");
  });
  await openBacklog(page);
  await page.getByLabel("Campaign", { exact: true }).selectOption("1");
  await expect(page.getByLabel("View")).toHaveValue("history");
  await expect(
    page.getByRole("heading", { name: "Archived completed work" }),
  ).toBeVisible();
  await expect(page.getByText("Archived campaign history")).toBeVisible();
  await expect(page.getByRole("button", { name: "New task" })).toBeDisabled();

  const rows = await getBacklogState(page);
  const openItem = rows.find((row) => row.title === "Archived open work");
  const createError = await callBacklogApi(page, "createCampaignBacklogItem", {
    campaignId: 1,
    workType: "other",
    title: "Blocked create",
    details: "",
    ownerType: "operator",
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    recurrence: "none",
    recurrenceTimeZone: "",
  });
  const updateError = await callBacklogApi(page, "updateCampaignBacklogItem", {
    id: Number(openItem?.id ?? 0),
    workType: "other",
    title: "Blocked update",
    details: "",
    ownerType: "operator",
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    recurrence: "none",
    recurrenceTimeZone: "",
  });
  const statusError = await callBacklogApi(
    page,
    "setCampaignBacklogItemStatus",
    {
      id: Number(openItem?.id ?? 0),
      status: "in_progress",
    },
  );
  expect(createError).toContain("read-only");
  expect(updateError).toContain("read-only");
  expect(statusError).toContain("read-only");
});

test("ignores out-of-order campaign and owner filter responses", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Backlog Campaign A");
  await createCampaign(page, "Backlog Campaign B");
  await seedBacklogItems(page, [
    { campaign_id: 1, title: "Campaign A operator", owner_type: "operator" },
    { campaign_id: 2, title: "Campaign B Linkgo", owner_type: "linkgo" },
  ]);
  await openBacklog(page);

  await setBacklogSelectDelay(page, 1, "all");
  await page.getByLabel("Campaign", { exact: true }).selectOption("1");
  await waitForBacklogSelect(page, 1, "all");
  await page.getByLabel("Campaign", { exact: true }).selectOption("2");
  await expect(
    page.getByRole("heading", { name: "Campaign B Linkgo" }),
  ).toBeVisible();
  await releaseBacklogSelect(page, 1, "all");
  await expect(page.getByLabel("Campaign", { exact: true })).toHaveValue("2");
  await expect(
    page.getByRole("heading", { name: "Campaign A operator" }),
  ).toBeHidden();

  await page.getByLabel("Campaign", { exact: true }).selectOption("all");
  await setBacklogSelectDelay(page, null, "operator");
  await page.getByLabel("Owner", { exact: true }).selectOption("operator");
  await waitForBacklogSelect(page, null, "operator");
  await page.getByLabel("Owner", { exact: true }).selectOption("linkgo");
  await expect(
    page.getByRole("heading", { name: "Campaign B Linkgo" }),
  ).toBeVisible();
  await releaseBacklogSelect(page, null, "operator");
  await expect(page.getByLabel("Owner", { exact: true })).toHaveValue("linkgo");
  await expect(
    page.getByRole("heading", { name: "Campaign A operator" }),
  ).toBeHidden();
});

test("refreshes the latest filters after a delayed mutation", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Mutation Campaign A");
  await createCampaign(page, "Mutation Campaign B");
  const completedAt = new Date().toISOString();
  await seedBacklogItems(page, [
    {
      campaign_id: 1,
      title: "Campaign A pending mutation",
      owner_type: "operator",
    },
    {
      campaign_id: 2,
      title: "Campaign B completed history",
      owner_type: "linkgo",
      status: "completed",
      completed_at: completedAt,
    },
  ]);
  await openBacklog(page);

  const campaignFilter = page.getByLabel("Campaign", { exact: true });
  const ownerFilter = page.getByLabel("Owner", { exact: true });
  const viewFilter = page.getByLabel("View");
  const campaignAItem = page.getByRole("heading", {
    name: "Campaign A pending mutation",
  });
  const campaignBItem = page.getByRole("heading", {
    name: "Campaign B completed history",
  });

  await campaignFilter.selectOption("1");
  await expect(campaignAItem).toBeVisible();
  await delayBacklogMutations(page);
  await campaignAItem
    .locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]")
    .getByRole("button", { name: "Start" })
    .click();
  await waitForBacklogMutation(page);

  await campaignFilter.selectOption("2");
  await ownerFilter.selectOption("linkgo");
  await viewFilter.selectOption("history");
  await expect(campaignBItem).toBeVisible();

  await releaseBacklogMutations(page);
  await expect(page.getByRole("button", { name: "New task" })).toBeEnabled();
  await expect(campaignFilter).toHaveValue("2");
  await expect(ownerFilter).toHaveValue("linkgo");
  await expect(viewFilter).toHaveValue("history");
  await expect(campaignBItem).toBeVisible();
  await expect(campaignAItem).toBeHidden();
});

test("supports keyboard focus return, narrow reflow, zoom, reduced motion, and forced colors", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Accessibility campaign with a long name");
  await seedBacklogItems(page, [
    {
      campaign_id: 1,
      title:
        "Review a long campaign backlog item without truncating decision-critical information",
      details:
        "This realistic long description verifies that due work, ownership, recurrence, and actions remain readable in a narrow resizable desktop window.",
      owner_type: "linkgo",
      recurrence: "weekly",
      work_type: "approval",
    },
  ]);
  await openBacklog(page);

  const trigger = page.getByRole("button", { name: "New task" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Create task" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const capture = process.env.LINKGO_CAPTURE_BACKLOG === "true";
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: capture
      ? ".gg/screenshots/campaign-backlog-desktop.png"
      : testInfo.outputPath("campaign-backlog-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 320, height: 800 });
  await expectReflow(page);
  await page.screenshot({
    path: capture
      ? ".gg/screenshots/campaign-backlog-narrow.png"
      : testInfo.outputPath("campaign-backlog-narrow.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectReflow(page);
  await expect(
    page.getByRole("heading", { name: /Review a long campaign/ }),
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(trigger).toHaveCSS("transition-property", "none");
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  for (const control of [
    trigger,
    page.getByLabel("Campaign", { exact: true }),
    page.getByLabel("Owner", { exact: true }),
    page.getByLabel("View"),
    page.getByRole("button", { name: "Start" }),
  ]) {
    await expect(control).toBeVisible();
    await expect(control).toHaveCSS("border-top-style", "solid");
    await expect(control).not.toHaveCSS("border-top-width", "0px");
  }
});

test.describe("stored recurrence zone under device travel", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("keeps New York wall-clock time when completion runs in Los Angeles", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await createCampaign(page, "Travel-safe campaign");
    await seedBacklogItems(page, [
      {
        campaign_id: 1,
        title: "Travel-safe daily review",
        due_at: "2020-03-07T14:00:00.000Z",
        recurrence: "daily",
        recurrence_timezone: "America/New_York",
      },
    ]);
    await openBacklog(page);
    const heading = page.getByRole("heading", {
      name: "Travel-safe daily review",
    });
    const card = heading.locator(
      "xpath=ancestor::div[contains(@class,'overflow-hidden')][1]",
    );
    await card.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit task" });
    await expect(editDialog.getByLabel("Schedule time zone")).toHaveValue(
      "America/New_York",
    );
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden();
    expect(
      (await getBacklogState(page)).find(
        (row) => row.title === "Travel-safe daily review",
      )?.recurrence_timezone,
    ).toBe("America/New_York");

    await completeItem(page, "Travel-safe daily review", false);

    const rows = (await getBacklogState(page)).filter(
      (row) => row.title === "Travel-safe daily review",
    );
    const successor = rows.find((row) => row.status === "pending");
    expect(successor?.recurrence_timezone).toBe("America/New_York");
    const newYorkTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(String(successor?.due_at)));
    expect(newYorkTime).toBe("09:00");
    await expect(page.getByText(/America\/New_York/)).toBeVisible();
  });
});

interface CreateItemOptions {
  title: string;
  dueAt: string;
  workType?: string;
  owner?: string;
  recurrence?: string;
}

interface BacklogTestApi {
  getNextCampaignBacklogDueAt: (
    dueAt: string,
    recurrence: "daily" | "weekly",
    recurrenceTimeZone: string,
    now?: Date,
  ) => string;
  createCampaignBacklogItem: (
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  updateCampaignBacklogItem: (
    input: Record<string, unknown>,
  ) => Promise<unknown>;
  setCampaignBacklogItemStatus: (
    input: Record<string, unknown>,
  ) => Promise<unknown>;
}

async function callBacklogApi(
  page: Page,
  method: keyof BacklogTestApi,
  input: Record<string, unknown>,
): Promise<string> {
  await page.waitForFunction(
    () => "__LINKGO_CAMPAIGN_BACKLOG_TEST_API__" in window,
  );
  return page.evaluate(
    async ({ method: methodName, input: methodInput }) => {
      const api = (
        window as unknown as {
          __LINKGO_CAMPAIGN_BACKLOG_TEST_API__?: BacklogTestApi;
        }
      ).__LINKGO_CAMPAIGN_BACKLOG_TEST_API__;
      if (!api) return "Backlog test API unavailable";
      try {
        await api[methodName](methodInput);
        return "";
      } catch (caught) {
        return caught instanceof Error ? caught.message : String(caught);
      }
    },
    { method, input },
  );
}

async function expectFieldValidation(
  dialog: Locator,
  label: string,
  errorId: string,
  message: string,
): Promise<void> {
  const control = dialog.getByLabel(label, { exact: true });
  const error = dialog.locator(`#${errorId}`);

  await expect(control).toHaveAttribute("aria-invalid", "true");
  await expect(control).toHaveAttribute("aria-describedby", errorId);
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toHaveText(message);
  await expect(error).toBeVisible();
}

async function expectFieldValidationToClear(control: Locator): Promise<void> {
  await expect(control).toHaveAttribute("aria-invalid", "false");
  await expect(control).not.toHaveAttribute("aria-describedby");
}

async function openBacklogWithCampaign(
  page: Page,
  name: string,
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, name);
  await openBacklog(page);
}

async function openBacklog(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Main menu" })
    .getByRole("button", { name: /^Tasks/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Loading tasks…")).toBeHidden();
}

async function createCampaign(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function openCreateDialog(page: Page) {
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "Create task" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createBacklogItem(
  page: Page,
  options: CreateItemOptions,
): Promise<void> {
  const dialog = await openCreateDialog(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByLabel("Due time").fill(options.dueAt);
  if (options.workType) {
    await dialog
      .getByLabel("Task type")
      .selectOption({ label: options.workType });
  }
  if (options.owner) {
    await dialog.getByLabel("Owner").selectOption({ label: options.owner });
  }
  if (options.recurrence) {
    await dialog
      .getByLabel("Repeats")
      .selectOption({ label: options.recurrence });
  }
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();
}

async function seedBacklogItems(
  page: Page,
  items: Array<Record<string, unknown>>,
): Promise<void> {
  await page.evaluate((seedItems) => {
    const seed = (
      window as unknown as {
        __LINKGO_SQL_SEED_BACKLOG_ITEM__?: (
          item: Record<string, unknown>,
        ) => number;
      }
    ).__LINKGO_SQL_SEED_BACKLOG_ITEM__;
    for (const item of seedItems) seed?.(item);
  }, items);
}

async function getBacklogState(
  page: Page,
): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __LINKGO_SQL_BACKLOG_ITEMS__?: () => Array<Record<string, unknown>>;
        }
      ).__LINKGO_SQL_BACKLOG_ITEMS__?.() ?? [],
  );
}

async function completeItem(
  page: Page,
  title: string,
  expectSuccess = true,
): Promise<void> {
  const heading = page.getByRole("heading", { name: title });
  const card = heading.locator(
    "xpath=ancestor::div[contains(@class,'overflow-hidden')][1]",
  );
  await card.getByRole("button", { name: "Complete" }).click();
  if (expectSuccess) await expect(heading).toBeHidden();
}

function futureLocalDateTime(hours: number): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function setBacklogSelectDelay(
  page: Page,
  campaignId: number | null,
  owner: "all" | "operator" | "linkgo",
): Promise<void> {
  await page.evaluate(
    ({ campaignId: id, owner: ownerFilter }) => {
      (
        window as unknown as {
          __LINKGO_SQL_DELAY_BACKLOG_SELECTS__?: (
            campaignId: number | null,
            owner: string,
          ) => void;
        }
      ).__LINKGO_SQL_DELAY_BACKLOG_SELECTS__?.(id, ownerFilter);
    },
    { campaignId, owner },
  );
}

async function waitForBacklogSelect(
  page: Page,
  campaignId: number | null,
  owner: "all" | "operator" | "linkgo",
): Promise<void> {
  await page.waitForFunction(
    ({ campaignId: id, owner: ownerFilter }) =>
      ((
        window as unknown as {
          __LINKGO_SQL_DELAYED_BACKLOG_SELECT_COUNT__?: (
            campaignId: number | null,
            owner: string,
          ) => number;
        }
      ).__LINKGO_SQL_DELAYED_BACKLOG_SELECT_COUNT__?.(id, ownerFilter) ?? 0) >
      0,
    { campaignId, owner },
  );
}

async function releaseBacklogSelect(
  page: Page,
  campaignId: number | null,
  owner: "all" | "operator" | "linkgo",
): Promise<void> {
  await page.evaluate(
    ({ campaignId: id, owner: ownerFilter }) => {
      (
        window as unknown as {
          __LINKGO_SQL_RELEASE_BACKLOG_SELECTS__?: (
            campaignId: number | null,
            owner: string,
          ) => void;
        }
      ).__LINKGO_SQL_RELEASE_BACKLOG_SELECTS__?.(id, ownerFilter);
    },
    { campaignId, owner },
  );
}

async function delayBacklogMutations(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_DELAY_BACKLOG_MUTATIONS__?: () => void }
    ).__LINKGO_DELAY_BACKLOG_MUTATIONS__?.();
  });
}

async function waitForBacklogMutation(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      ((
        window as unknown as {
          __LINKGO_DELAYED_BACKLOG_MUTATION_COUNT__?: () => number;
        }
      ).__LINKGO_DELAYED_BACKLOG_MUTATION_COUNT__?.() ?? 0) > 0,
  );
}

async function releaseBacklogMutations(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_RELEASE_BACKLOG_MUTATIONS__?: () => void }
    ).__LINKGO_RELEASE_BACKLOG_MUTATIONS__?.();
  });
}

async function expectReflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
}
