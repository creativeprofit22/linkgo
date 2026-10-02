import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

test("creates a required-metadata calendar slot from an approved post", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedPost(page);
  await openCalendar(page);
  await createCalendarSlot(page, {
    slotFor: "2026-07-15T09:30",
    timezone: "America/New_York",
    purpose: "proof",
    format: "carousel",
    angle: "Show the operator proof behind the workflow.",
    visualDirection:
      "Five-slide carousel with annotated before and after states.",
    cta: "Reply proof to get the checklist.",
    notes: "Needs a simple product screenshot.",
  });

  await expect(getBadge(page, "Proof")).toBeVisible();
  await expect(getBadge(page, "Planned")).toBeVisible();
  await expect(page.getByText("Carousel", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Show the operator proof behind the workflow."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Five-slide carousel with annotated before and after states.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Reply proof to get the checklist."),
  ).toBeVisible();
});

test("schedules a planned calendar slot through approval scheduling", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedPost(page);
  await openCalendar(page);
  await createCalendarSlot(page, {
    slotFor: "2026-07-16T14:45",
    timezone: "Europe/London",
  });

  await page.getByRole("button", { name: "Schedule post" }).click();
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();

  const [job] = await getScheduleJobs(page);
  expect(job).toMatchObject({
    approval_id: 1,
    scheduled_for: "2026-07-16T14:45",
    timezone: "Europe/London",
    status: "scheduled",
  });

  await openApprovals(page);
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
});

test("hides schedule action when approval has a completed schedule job", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedPost(page);
  await openCalendar(page);
  await createCalendarSlot(page, { slotFor: "2026-07-17T09:00" });

  await page.getByRole("button", { name: "Schedule post" }).click();
  await markScheduleCompletedAndApprovalApproved(page, 1, 1);
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.getByText("2026-07-17T09:00 · local · Done")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Schedule post" }),
  ).toBeHidden();
});

test("edits calendar slot metadata and keeps it after refresh", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedPost(page);
  await openCalendar(page);
  await createCalendarSlot(page, { slotFor: "2026-07-17T11:00" });

  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit planned post" });
  await dialog.getByLabel("Goal").selectOption("conversion");
  await dialog.getByLabel("Format").selectOption("video");
  await dialog.getByLabel("Angle").fill("Edited conversion planning angle.");
  await dialog
    .getByLabel("Look and feel")
    .fill("Edited short video with a founder talking head.");
  await dialog.getByLabel("Call to action").fill("Book a planning session.");
  await dialog.getByLabel("Notes").fill("Edited after team review.");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(getBadge(page, "Conversion")).toBeVisible();
  await expect(page.getByText("Video", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Edited conversion planning angle."),
  ).toBeVisible();
  await expect(
    page.getByText("Edited short video with a founder talking head."),
  ).toBeVisible();
  await expect(page.getByText("Book a planning session.")).toBeVisible();
  await expect(page.getByText("Edited after team review.")).toBeVisible();
});

test("archives a slot and hides the schedule action", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedPost(page);
  await openCalendar(page);
  await createCalendarSlot(page, { slotFor: "2026-07-18T10:00" });

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Archive" }).click();

  await expect(getBadge(page, "Archived")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Schedule post" }),
  ).toBeHidden();
});

test("archived campaigns block new slots and slot changes", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedPost(page);
  await openCalendar(page);
  await createCalendarSlot(page, { slotFor: "2026-07-19T10:00" });
  await archiveCampaignThroughMockSql(page, 1);

  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByRole("combobox").selectOption("1");
  await expect(
    page.getByText("This campaign is archived", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Plan a post" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Archive" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Schedule post" }),
  ).toBeHidden();
});

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

function getBadge(page: Page, label: string): Locator {
  return page.locator("span").filter({
    hasText: new RegExp(`^${label.replaceAll("'", "\\u0027")}$`, "u"),
  });
}

async function openCalendar(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Calendar/ }).click();
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();
}

async function openApprovals(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Approvals/ }).click();
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
  await page.getByRole("button", { name: /^Ideas/ }).click();
  await expect(
    page.getByRole("heading", { name: "Ideas", exact: true }),
  ).toBeVisible();
}

async function openDrafts(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Drafts/ }).click();
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
  await dialog.getByLabel("Date and time").fill(input.slotFor);
  await dialog.getByLabel("Time zone").fill(input.timezone ?? "local");
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

async function markScheduleCompletedAndApprovalApproved(
  page: Page,
  scheduleJobId: number,
  approvalId: number,
): Promise<void> {
  await page.evaluate(
    async ({ scheduleJobId, approvalId }) => {
      const invoke = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__?.invoke;
      await invoke?.("__linkgo_test_sql|execute", {
        query:
          "UPDATE schedule_jobs SET status = 'completed', updated_at = datetime('now') WHERE id = $1",
        values: [scheduleJobId],
      });
      await invoke?.("__linkgo_test_sql|execute", {
        query:
          "UPDATE approvals SET status = 'approved', updated_at = datetime('now') WHERE id = $1",
        values: [approvalId],
      });
    },
    { scheduleJobId, approvalId },
  );
}

async function archiveCampaignThroughMockSql(
  page: Page,
  id: number,
): Promise<void> {
  await page.evaluate(async (campaignId) => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__?.invoke;
    await invoke?.("__linkgo_test_sql|execute", {
      query:
        "UPDATE campaigns SET status = $1, updated_at = datetime('now') WHERE id = $2",
      values: ["archived", campaignId],
    });
  }, id);
}
