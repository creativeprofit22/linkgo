import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  pickDateTime,
  rescheduleInDialog,
} from "./helpers/calendar-scheduling";
import { setupTauriMocks } from "./helpers/tauri-mocks";
import {
  expectCurrentScreen,
  mainMenu,
  openSection,
} from "./helpers/navigation";

// One Calendar for all scheduling: pick, change and cancel a post's time,
// recover a post that didn't go out, and land old Auto-posting links here.

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(120_000);

test("schedules a post with a keyboard-only date choice", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createApprovedPost(page);
  await openCalendar(page);

  await page.getByRole("button", { name: "Plan a post" }).click();
  const dialog = page.getByRole("dialog", { name: "Plan a post" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Time zone").fill("Europe/London");
  await expect(dialog.getByText(/Times are in/u)).toContainText(
    "Europe/London",
  );

  // Open the grid and move with the arrow keys only.
  const dateButton = dialog.getByLabel("Date", { exact: true });
  await dateButton.focus();
  await page.keyboard.press("Enter");
  const grid = page.getByRole("dialog", { name: "Choose a date" });
  await expect(grid).toBeVisible();
  const focusedDay = grid.locator("td[data-day] button:focus");
  await expect(focusedDay).toHaveCount(1);
  const startDay =
    (await focusedDay.locator("xpath=..").getAttribute("data-day")) ?? "";
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const expectedDay = addDays(startDay, 8);
  await expect(
    grid.locator(`td[data-day="${expectedDay}"] button:focus`),
  ).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(grid).toBeHidden();
  await expect(dateButton).toBeFocused();
  await dialog.getByLabel("Time", { exact: true }).fill("14:45");

  await dialog.getByLabel("Angle").fill("Build trust with an operator lesson.");
  await dialog
    .getByLabel("Look and feel")
    .fill("Text-only post with a crisp first line.");
  await dialog
    .getByLabel("Call to action")
    .fill("Save this before your next outbound sprint.");
  await dialog.getByRole("button", { name: "Plan post" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Schedule post" }).click();
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
  const [job] = await getScheduleJobs(page);
  expect(job).toMatchObject({
    scheduled_for: `${expectedDay}T14:45`,
    timezone: "Europe/London",
    status: "scheduled",
  });
});

test("reschedules a scheduled post to a new time", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createScheduledSlot(page, "2026-07-16T14:45");

  // The Calendar with its Auto-posting side panel has no axe violations.
  await expect(
    page.getByRole("complementary", { name: "Auto-posting" }),
  ).toBeVisible();
  const pageScan = await new AxeBuilder({ page }).include("main").analyze();
  expect(pageScan.violations).toEqual([]);

  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Pick a new time" });
  await expect(dialog.getByLabel("Time", { exact: true })).toHaveValue("14:45");

  // The open date grid is accessible too.
  await dialog.getByLabel("Date", { exact: true }).click();
  const grid = page.getByRole("dialog", { name: "Choose a date" });
  await expect(grid).toBeVisible();
  const pickerScan = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(pickerScan.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(grid).toBeHidden();
  await expect(dialog).toBeVisible();
  await rescheduleInDialog(page, {
    scheduledFor: "2026-08-03T08:15",
    timezone: "Europe/London",
  });

  // The post keeps one schedule; its time moves to the new slot.
  await expect
    .poll(async () =>
      (await getScheduleJobs(page)).map((job) => [
        job.status,
        job.scheduled_for,
        job.timezone,
      ]),
    )
    .toEqual([["scheduled", "2026-08-03T08:15", "Europe/London"]]);
  await expect(page.getByText(/Aug.*2026.*08:15/u).first()).toBeVisible();
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
});

test("keeps the picked time when saving a new time fails", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createScheduledSlot(page, "2026-07-16T14:45");

  // Hold the next slot update until the test releases it, then reject it.
  await page.evaluate(() => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
      __LINKGO_RELEASE_SLOT_UPDATE__?: () => void;
    };
    const original = w.__TAURI_INTERNALS__.invoke;
    let held = false;
    w.__TAURI_INTERNALS__.invoke = (cmd, args) => {
      if (cmd !== "linkgo_content_calendar_update_slot" || held)
        return original(cmd, args);
      held = true;
      return new Promise((_, reject) => {
        w.__LINKGO_RELEASE_SLOT_UPDATE__ = () =>
          reject(new Error("The calendar is busy. Try again."));
      });
    };
  });

  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Pick a new time" });
  await expect(dialog).toBeVisible();
  await pickDateTime(page, dialog, "2026-08-03T08:15");
  const dateButton = dialog.getByLabel("Date", { exact: true });
  const pickedDate = await dateButton.textContent();
  await dialog.getByRole("button", { name: "Save new time" }).click();

  // The dialog stays mounted while saving and shows it.
  await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();

  await page.evaluate(() =>
    (
      window as unknown as { __LINKGO_RELEASE_SLOT_UPDATE__: () => void }
    ).__LINKGO_RELEASE_SLOT_UPDATE__(),
  );
  await expect(page.getByText("We couldn't change the time")).toBeVisible();

  // Still open, still showing the time the user picked.
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save new time" }),
  ).toBeEnabled();
  await expect(dialog.getByLabel("Time", { exact: true })).toHaveValue("08:15");
  await expect(dateButton).toHaveText(pickedDate ?? "");
  const [job] = await getScheduleJobs(page);
  expect(job).toMatchObject({
    scheduled_for: "2026-07-16T14:45",
    status: "scheduled",
  });
});

test("locks the time in Edit while a post is scheduled", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createScheduledSlot(page, "2026-07-16T14:45");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit planned post" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "This post is scheduled. Use Reschedule to change its time.",
    ),
  ).toBeVisible();
  await expect(dialog.getByLabel("Date", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Time", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Time zone")).toBeDisabled();

  // Other plan fields still save, and the job keeps its time.
  await dialog.getByLabel("Notes").fill("Pin the first comment.");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  const [job] = await getScheduleJobs(page);
  expect(job).toMatchObject({
    scheduled_for: "2026-07-16T14:45",
    timezone: "Europe/London",
    status: "scheduled",
  });
});

test("keeps the time editable in Edit before a post is scheduled", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createApprovedPost(page);
  await openCalendar(page);
  await createCalendarSlot(page, {
    slotFor: "2026-07-16T14:45",
    timezone: "Europe/London",
  });

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit planned post" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Use Reschedule/u)).toHaveCount(0);
  await expect(dialog.getByLabel("Date", { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("Time", { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel("Time zone")).toBeEnabled();
});

test("cancels a scheduled post and lets it be scheduled again", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createScheduledSlot(page, "2026-07-16T14:45");

  // Saying no to the confirm keeps the schedule.
  page.once("dialog", (prompt) => void prompt.dismiss());
  await page
    .getByRole("button", { name: "Cancel schedule", exact: true })
    .click();
  expect((await getScheduleJobs(page))[0]?.status).toBe("scheduled");

  page.once("dialog", (prompt) => void prompt.accept());
  await page
    .getByRole("button", { name: "Cancel schedule", exact: true })
    .click();
  await expect
    .poll(async () => (await getScheduleJobs(page))[0]?.status)
    .toBe("cancelled");
  await expect(
    page.getByRole("button", { name: "Cancel schedule", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Schedule post" }),
  ).toBeVisible();

  await openApprovals(page);
  await expect(getBadge(page, "Approved")).toBeVisible();
});

test("recovers a post that didn't go out from the side panel", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createScheduledSlot(page, "2020-01-01T09:00");
  await page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    target.__LINKGO_LINKEDIN_PUBLISH_ERROR__ =
      "LinkedIn terminal scheduler failure.";
    target.__LINKGO_SCHEDULER_FORCE_TERMINAL_FAILURE__ = true;
  });

  const panel = page.getByRole("complementary", { name: "Auto-posting" });
  await panel.getByRole("button", { name: "Post what's due now" }).click();
  const failed = panel.getByRole("list", { name: "Posts that didn't go out" });
  await expect(failed).toContainText("We turned 12 customer interviews");
  await expect
    .poll(async () => (await getScheduleJobs(page))[0]?.status)
    .toBe("failed");

  await failed.getByRole("button", { name: "Reschedule", exact: true }).click();
  await rescheduleInDialog(page, {
    scheduledFor: "2020-03-02T10:30",
    timezone: "local",
  });

  await expect
    .poll(async () =>
      (await getScheduleJobs(page)).map((job) => [
        job.status,
        job.scheduled_for,
      ]),
    )
    .toEqual([["scheduled", "2020-03-02T10:30"]]);
  await expect(failed.getByText("Scheduled again.")).toBeVisible();
  await expect(
    failed.getByRole("button", { name: "Reschedule", exact: true }),
  ).toHaveCount(0);
});

test("updates the slot card after the side panel posts what's due", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createScheduledSlot(page, "2020-01-01T09:00");
  const slotCard = page.locator('[id^="calendar-slot-"]').first();
  await expect(
    slotCard.getByRole("button", { name: "Cancel schedule", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    target.__LINKGO_LINKEDIN_PUBLISH_ERROR__ =
      "LinkedIn terminal scheduler failure.";
    target.__LINKGO_SCHEDULER_FORCE_TERMINAL_FAILURE__ = true;
  });

  const panel = page.getByRole("complementary", { name: "Auto-posting" });
  await panel.getByRole("button", { name: "Post what's due now" }).click();
  await expect
    .poll(async () => (await getScheduleJobs(page))[0]?.status)
    .toBe("failed");

  // No Refresh: the card drops its stale "Scheduled" state on its own.
  await expect(slotCard.getByText(/Didn.t post/u).first()).toBeVisible();
  await expect(
    slotCard.getByRole("button", { name: "Cancel schedule", exact: true }),
  ).toHaveCount(0);
  await expect(
    slotCard.locator(BADGE_SPAN_SELECTOR).filter({ hasText: /^Scheduled$/u }),
  ).toHaveCount(0);
  await expect(
    slotCard.getByRole("button", { name: "Reschedule", exact: true }),
  ).toBeVisible();
});

test("old Auto-posting links open the Calendar", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "#/scheduler";
  });

  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/calendar$/u);
  await expect(
    page.getByRole("complementary", { name: "Auto-posting" }),
  ).toBeVisible();
  await expectCurrentScreen(page, "calendar");
  await expect(
    mainMenu(page).getByRole("button", { name: /^Auto-posting/u }),
  ).toHaveCount(0);

  // The retired link is replaced, so Back skips it.
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
});

async function createScheduledSlot(page: Page, slotFor: string): Promise<void> {
  await createApprovedPost(page);
  await openCalendar(page);
  await createCalendarSlot(page, { slotFor, timezone: "Europe/London" });
  await page.getByRole("button", { name: "Schedule post" }).click();
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
}

function addDays(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return next.toISOString().slice(0, 10);
}

interface VariantFormInput {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

interface CalendarSlotInput {
  slotFor: string;
  timezone?: string;
  purpose?: string;
  format?: string;
  angle?: string;
  visualDirection?: string;
  cta?: string;
  notes?: string;
}

interface ScheduleJobRow {
  id: number;
  approval_id: number;
  scheduled_for: string;
  timezone: string;
  status: "scheduled" | "cancelled" | "completed" | "failed";
}

// Status badges only: the post-stage tracker repeats labels like "Posted".
const BADGE_SPAN_SELECTOR = 'span:not([data-testid="post-stage-tracker"] *)';

function getBadge(page: Page, label: string): Locator {
  return page.locator(BADGE_SPAN_SELECTOR).filter({
    hasText: new RegExp(`^${label.replaceAll("'", "\\u0027")}$`, "u"),
  });
}

async function openCalendar(page: Page): Promise<void> {
  await openSection(page, "Calendar");
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
}

async function openApprovals(page: Page): Promise<void> {
  await openSection(page, "Create", "Approvals");
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
}

async function createApprovedPost(page: Page): Promise<void> {
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
}

async function createReadyDraft(
  page: Page,
  variant: VariantFormInput,
): Promise<void> {
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page, variant);
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

async function createCampaign(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Name").fill("Founder-led calendar growth");
  await page.getByLabel("Product").fill("A local-first LinkedIn cockpit");
  await page.getByLabel("Audience").fill("Solo founders and operators");
  await page.getByLabel("Voice").fill("Concrete, concise, practical");
  await page.getByLabel("Tone").fill("Helpful operator");
  await page
    .getByLabel("Manual keywords")
    .fill("LinkedIn growth, founder content");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function addCandidate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add idea" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add idea" });
  await expect(dialog).toBeVisible();
  await page
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/calendar-activity-123/");
  await page
    .getByLabel("Post text")
    .fill("This founder post has a sharp ICP signal.");
  await page.getByLabel("Author name").fill("Jane Operator");
  await page
    .getByLabel("Author profile URL")
    .fill("https://www.linkedin.com/in/jane-operator/");
  await page.getByLabel("Posted at").fill("2026-06-25");
  await page.getByLabel("Source keyword").fill("founder content");
  await page.getByLabel("Match score").fill("87");
  await page.getByLabel("Score reason").fill("Strong audience overlap.");
  await page.getByLabel("Notes").fill("Good calendar candidate.");
  await dialog.getByRole("button", { name: "Add idea" }).click();
  await expect(dialog).toBeHidden();
}

async function createDraft(
  page: Page,
  variant: VariantFormInput,
): Promise<void> {
  await page.getByRole("button", { name: "Create draft" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create draft" });
  await expect(dialog).toBeVisible();
  await page
    .getByLabel("Angle")
    .fill("Turn the source post into a tactical lesson");
  await page.getByLabel("Notes").fill("Keep the operator tone concrete.");
  await page.locator("#draft-variant-0-hook").fill(variant.hook);
  await page.locator("#draft-variant-0-body").fill(variant.body);
  await page.locator("#draft-variant-0-cta").fill(variant.cta);
  await page.locator("#draft-variant-0-hashtags").fill(variant.hashtags);
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(dialog).toBeHidden();
}

async function createReview(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Send for approval" }).click();
  const dialog = page.getByRole("dialog", { name: "Send for approval" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Reviewer notes").fill("Human pass before scheduling.");
  await dialog.getByRole("button", { name: "Send for approval" }).click();
  await expect(dialog).toBeHidden();
}

async function createCalendarSlot(
  page: Page,
  input: CalendarSlotInput,
): Promise<void> {
  await page.getByRole("button", { name: "Plan a post" }).click();
  const dialog = page.getByRole("dialog", { name: "Plan a post" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Time zone").fill(input.timezone ?? "local");
  await pickDateTime(page, dialog, input.slotFor);
  await dialog.getByLabel("Goal").selectOption(input.purpose ?? "trust");
  await dialog.getByLabel("Format").selectOption(input.format ?? "text");
  await dialog
    .getByLabel("Angle")
    .fill(input.angle ?? "Build trust with a practical operator lesson.");
  await dialog
    .getByLabel("Look and feel")
    .fill(input.visualDirection ?? "Text-only post with a crisp first line.");
  await dialog
    .getByLabel("Call to action")
    .fill(input.cta ?? "Save this before your next outbound sprint.");
  await dialog.getByLabel("Notes").fill(input.notes ?? "");
  await dialog.getByRole("button", { name: "Plan post" }).click();
  await expect(dialog).toBeHidden();
}

function cleanVariant(): VariantFormInput {
  return {
    hook: "We turned 12 customer interviews into one simple sales motion",
    body: "The useful part was not the script. It was the pattern behind the replies.",
    cta: "Save this before your next outbound sprint.",
    hashtags: "#LinkedInGrowth #Sales",
  };
}

async function getScheduleJobs(page: Page): Promise<ScheduleJobRow[]> {
  return page.evaluate(() => {
    const getter = (
      window as unknown as {
        __LINKGO_SQL_SCHEDULE_JOBS__?: () => ScheduleJobRow[];
      }
    ).__LINKGO_SQL_SCHEDULE_JOBS__;
    return getter?.() ?? [];
  });
}
