import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

test("starts the scheduler from the Scheduler tab", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openScheduler(page);

  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Turn on auto-posting" }).click();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await expect(page.getByText("Off after restart")).toHaveCount(0);
});

test("flags a scheduler that was on before Linkgo restarted", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_SCHEDULER_SIMULATE_RESTART__ = true;
  });
  await openScheduler(page);

  await expect(
    page.getByText("Off after restart", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Off", { exact: true })).toHaveCount(0);
  const notice = page
    .getByRole("status")
    .filter({ hasText: "Auto-posting turned off when Linkgo restarted" });
  await expect(notice).toContainText(
    "Go to Safety and look for any post marked “Couldn’t confirm”",
  );
  const startButton = page.getByRole("button", {
    name: "Turn on auto-posting",
  });
  await expect(startButton).toBeEnabled();

  await startButton.click();
  await expect(page.getByText("On", { exact: true })).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("runs a due scheduled post and records a successful publish", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedScheduledPost(page, "2020-01-01T09:00");

  await openScheduler(page);
  await expect(
    page.getByText("Due now", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Post what's due now" }).click();
  await expect(
    page.getByText("Scheduled LinkedIn post was published."),
  ).toBeVisible();

  const [schedule] = await getScheduleJobs(page);
  const [attempt] = await getPublishAttempts(page);
  expect(schedule.status).toBe("completed");
  expect(attempt.status).toBe("succeeded");
  expect(attempt.schedule_job_id).toBe(schedule.id);

  const attemptRow = page
    .getByRole("list", { name: "Recent posting attempts" })
    .getByRole("listitem")
    .first();
  await expect(attemptRow).toContainText(cleanVariant().hook);
  await expect(attemptRow).toContainText("Founder-led scheduler growth");
  await expect(attemptRow).toContainText("Posted");

  await openApprovals(page);
  await expect(getBadge(page, "Posted")).toBeVisible();
  await expect(getBadge(page, "Done").first()).toBeVisible();
});

test("keeps a failed due publish scheduled for retry", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedScheduledPost(page, "2020-01-01T09:00");
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_LINKEDIN_PUBLISH_ERROR__ =
      "LinkedIn API rejected the scheduled post.";
  });

  await openScheduler(page);
  await page.getByRole("button", { name: "Post what's due now" }).click();
  await expect(
    page.getByText("Scheduled LinkedIn publish failed and will retry."),
  ).toBeVisible();

  const [schedule] = await getScheduleJobs(page);
  const [attempt] = await getPublishAttempts(page);
  expect(schedule.status).toBe("scheduled");
  expect(schedule.attempt_count).toBe(1);
  expect(schedule.next_attempt_at).toBeTruthy();
  expect(schedule.last_error).toContain("LinkedIn API rejected");
  expect(attempt.status).toBe("failed");
});

test("moves a terminal scheduler failure to operator follow-up", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedScheduledPost(page, "2020-01-01T09:00");
  await page.evaluate(() => {
    const target = window as unknown as Record<string, unknown>;
    target.__LINKGO_LINKEDIN_PUBLISH_ERROR__ =
      "LinkedIn terminal scheduler failure.";
    target.__LINKGO_SCHEDULER_FORCE_TERMINAL_FAILURE__ = true;
  });

  await openScheduler(page);
  await page.getByRole("button", { name: "Post what's due now" }).click();
  await expect(
    page.getByText("Scheduled LinkedIn publish failed permanently."),
  ).toBeVisible();

  const [schedule] = await getScheduleJobs(page);
  const counts = await getStateCounts(page);
  expect(schedule.status).toBe("failed");
  expect(counts.errorQueueItems).toBe(1);

  await openApprovals(page);
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(
    getBadge(page, "Didn't post").filter({ visible: true }).first(),
  ).toBeVisible();
});

test("global kill switch blocks due jobs without publishing", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedScheduledPost(page, "2020-01-01T09:00");
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_LINKEDIN_PUBLISH_INVOKES__ = 0;
  });

  await openSafety(page);
  await page.getByLabel("Reason for pausing").fill("Pause scheduler tests.");
  await page.getByRole("button", { name: "Pause everything" }).click();
  await expect(
    page.getByText("On — everything is paused", { exact: true }),
  ).toBeVisible();

  await openScheduler(page);
  await expect(
    page.getByRole("button", { name: "Turn on auto-posting" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Post what's due now" }).click();
  await expect(
    page.getByText("didn't go out because everything is paused").first(),
  ).toBeVisible();

  const [schedule] = await getScheduleJobs(page);
  const publishInvokes = await getLinkedInPublishInvokeCount(page);
  expect(schedule.status).toBe("scheduled");
  expect(publishInvokes).toBe(0);
});

interface VariantFormInput {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

interface ScheduleJobRow {
  id: number;
  approval_id: number;
  status: "scheduled" | "cancelled" | "completed" | "failed";
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_error: string;
}

interface PublishAttemptRow {
  id: number;
  approval_id: number;
  schedule_job_id: number | null;
  status: "succeeded" | "failed";
}

// Status badges only: the post-stage tracker repeats labels like "Posted".
const BADGE_SPAN_SELECTOR = 'span:not([data-testid="post-stage-tracker"] *)';

function getBadge(page: Page, label: string): Locator {
  return page.locator(BADGE_SPAN_SELECTOR).filter({
    hasText: new RegExp(`^${label.replaceAll("'", "\\u0027")}$`, "u"),
  });
}

async function openScheduler(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Auto-posting/ }).click();
  await expect(
    page.getByRole("heading", { name: "Auto-posting", exact: true }),
  ).toBeVisible();
}

async function openApprovals(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Approvals/ }).click();
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
}

async function openSafety(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Safety/ }).click();
  await expect(
    page.getByRole("heading", { name: "Safety", exact: true }),
  ).toBeVisible();
}

async function createApprovedScheduledPost(
  page: Page,
  scheduledFor: string,
): Promise<void> {
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await page.getByRole("button", { name: "Pick a time", exact: true }).click();
  await page.getByLabel("Date and time").fill(scheduledFor);
  await page.getByLabel("Time zone").fill("local");
  const dialog = page.getByRole("dialog", { name: "Schedule post" });
  await dialog.getByRole("button", { name: "Schedule post" }).click();
  await expect(dialog).toBeHidden();
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
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
  await page.getByLabel("Name").fill("Founder-led scheduler growth");
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
    .fill("https://www.linkedin.com/posts/scheduler-activity-123/");
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
  await page.getByLabel("Notes").fill("Good scheduler candidate.");
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

async function getPublishAttempts(page: Page): Promise<PublishAttemptRow[]> {
  return page.evaluate(() => {
    const getter = (
      window as unknown as {
        __LINKGO_SQL_PUBLISH_ATTEMPTS__?: () => PublishAttemptRow[];
      }
    ).__LINKGO_SQL_PUBLISH_ATTEMPTS__;
    return getter?.() ?? [];
  });
}

async function getStateCounts(
  page: Page,
): Promise<{ errorQueueItems: number }> {
  return page.evaluate(() => {
    const stateCounts = (
      window as unknown as {
        __LINKGO_SQL_STATE_COUNTS__?: () => { errorQueueItems: number };
      }
    ).__LINKGO_SQL_STATE_COUNTS__;
    return stateCounts?.() ?? { errorQueueItems: 0 };
  });
}

async function getLinkedInPublishInvokeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    return (
      (window as unknown as { __LINKGO_LINKEDIN_PUBLISH_INVOKES__?: number })
        .__LINKGO_LINKEDIN_PUBLISH_INVOKES__ ?? 0
    );
  });
}
