import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

test("Safety tab renders settings, summaries, and empty states", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openSafety(page);

  await expect(
    page.getByText("Emergency pause", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Problems to fix", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Stopped by limits today")).toBeVisible();
  await expect(page.getByText("Allowed by limits today")).toBeVisible();
  await expect(
    page.getByText("Safety history", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Nothing to fix right now.")).toBeVisible();
  await expect(
    page.getByText("Nothing has been checked against your posting limits yet."),
  ).toBeVisible();
  await expect(page.getByText("No safety activity yet.")).toBeVisible();
});

test("Global kill switch hides approval scheduling and agent dry-run start actions", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await createReadyDraftOnCurrentCampaign(
    page,
    cleanVariant(),
    "kill-switch-schedule",
  );
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await openAgentRuntime(page);
  await createDryRun(page);
  await openSafety(page);

  await page
    .getByLabel("Reason for pausing")
    .fill("Pause local automation during review.");
  await page.getByRole("button", { name: "Pause everything" }).click();
  await expect(
    page.getByText("On — everything is paused", { exact: true }),
  ).toBeVisible();

  await openApprovals(page);
  await expect(
    page.getByRole("button", { name: "Pick a time", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByText("Pause everything is on, so posts can't be scheduled."),
  ).toBeVisible();
  await expect(
    page.getByText("Pause local automation during review."),
  ).toBeVisible();

  const scheduleError = await scheduleApprovalViaDataApi(page, {
    approvalId: 1,
    scheduledFor: "2026-06-25T14:30",
    timezone: "local",
  });
  expect(scheduleError).toContain("Global kill switch is enabled");

  await openAgentRuntime(page);
  await expect(
    page.getByRole("button", { name: "Start practice run" }),
  ).toBeHidden();
  await expect(
    page.getByText("Emergency pause is on.", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Pause local automation during review."),
  ).toBeVisible();

  const auditEvents = await getSafetyAuditEvents(page);
  expect(
    auditEvents.some((event) => event.event_type === "kill_switch_enabled"),
  ).toBe(true);

  await expect
    .poll(async () => {
      const counts = await getStateCounts(page);
      const rateLimitEvents = await getRateLimitEvents(page);
      const blockedEvents = rateLimitEvents.filter(
        (event) =>
          event.action === "schedule_post" && event.decision === "blocked",
      );
      return {
        scheduleJobs: counts.scheduleJobs,
        blockedEvents: blockedEvents.length,
        windowKey: blockedEvents[0]?.window_key,
        limitValue: blockedEvents[0]?.limit_value,
        currentCount: blockedEvents[0]?.current_count,
      };
    })
    .toEqual({
      scheduleJobs: 0,
      blockedEvents: 1,
      windowKey: "2026-06-25",
      limitValue: 1,
      currentCount: 0,
    });
});

test("Daily post scheduling cap blocks a second same-day schedule", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await createReadyDraftOnCurrentCampaign(page, cleanVariant(), "first");
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await scheduleApproval(page, "2026-06-25T14:30", "local");

  await createReadyDraftOnCurrentCampaign(page, secondVariant(), "second");
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Pick a time", exact: true }).click();
  await page.getByLabel("Date and time").fill("2026-06-25T18:00");
  await page.getByLabel("Time zone").fill("local");
  await page.getByRole("button", { name: "Schedule post" }).click();

  await expect
    .poll(async () => {
      const counts = await getStateCounts(page);
      const rateLimitEvents = await getRateLimitEvents(page);
      return {
        scheduleJobs: counts.scheduleJobs,
        blockedEvents: rateLimitEvents.filter(
          (event) =>
            event.action === "schedule_post" && event.decision === "blocked",
        ).length,
      };
    })
    .toEqual({ scheduleJobs: 1, blockedEvents: 1 });
  const rateLimitEvents = await getRateLimitEvents(page);
  expect(
    rateLimitEvents.some(
      (event) =>
        event.action === "schedule_post" && event.decision === "blocked",
    ),
  ).toBe(true);
});

test("Failed publish attempt creates an open error queue item", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await createReadyDraftOnCurrentCampaign(
    page,
    cleanVariant(),
    "failed-publish",
  );
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Mark as not posted" }).click();
  await page.getByLabel("What went wrong").fill("Local browser was offline.");
  await page.getByRole("button", { name: "Save result" }).click();

  await openSafety(page);
  await expect(
    page.getByRole("heading", { name: "Publish attempt failed" }),
  ).toBeVisible();
  await expect(getBadge(page, "Needs attention")).toBeVisible();

  const items = await getErrorQueueItems(page);
  expect(items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source_type: "publish_attempt",
        status: "open",
        title: "Publish attempt failed",
      }),
    ]),
  );
});

test("Error queue item moves open to in progress to awaiting review to resolved", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await createReadyDraftOnCurrentCampaign(
    page,
    cleanVariant(),
    "resolve-error",
  );
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Mark as not posted" }).click();
  await page.getByLabel("What went wrong").fill("Local browser was offline.");
  await page.getByRole("button", { name: "Save result" }).click();
  await openSafety(page);

  await page.getByRole("button", { name: "Mark as “Working on it”" }).click();
  await expect(getBadge(page, "Working on it")).toBeVisible();
  await page.getByRole("button", { name: "Mark as “Ready to check”" }).click();
  await expect(getBadge(page, "Ready to check")).toBeVisible();
  await page.getByRole("button", { name: "Mark as “Fixed”" }).click();
  await expect(getBadge(page, "Fixed")).toBeVisible();

  const items = await getErrorQueueItems(page);
  expect(items[0]?.status).toBe("resolved");
});

interface VariantFormInput {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

interface SafetyAuditEventRow {
  event_type: string;
  severity: string;
}

interface RateLimitEventRow {
  action: string;
  window_key: string;
  limit_value: number;
  current_count: number;
  decision: string;
}

interface ErrorQueueItemRow {
  source_type: string;
  status: string;
  title: string;
}

// Status badges only: the post-stage tracker repeats labels like "Posted".
const BADGE_SPAN_SELECTOR = 'span:not([data-testid="post-stage-tracker"] *)';

function getBadge(page: Page, label: string): Locator {
  return page
    .locator(BADGE_SPAN_SELECTOR)
    .filter({ hasText: new RegExp(`^${label}$`, "iu") })
    .first();
}

function cleanVariant(): VariantFormInput {
  return {
    hook: "We turned 12 customer interviews into one simple sales motion",
    body: "The useful part was not the script. It was the pattern behind the replies.",
    cta: "Save this before your next outbound sprint.",
    hashtags: "#LinkedInGrowth #Sales",
  };
}

function secondVariant(): VariantFormInput {
  return {
    hook: "One customer reply changed how we write founder-led posts",
    body: "The win was specific language from the market, not a generic content framework.",
    cta: "Use this before your next post draft.",
    hashtags: "#FounderLedSales #Content",
  };
}

async function getSafetyAuditEvents(
  page: Page,
): Promise<SafetyAuditEventRow[]> {
  return page.evaluate(() => {
    const getter = (
      window as unknown as {
        __LINKGO_SQL_SAFETY_AUDIT_EVENTS__?: () => SafetyAuditEventRow[];
      }
    ).__LINKGO_SQL_SAFETY_AUDIT_EVENTS__;
    if (getter === undefined)
      throw new Error("Safety audit events unavailable");
    return getter();
  });
}

async function getRateLimitEvents(page: Page): Promise<RateLimitEventRow[]> {
  return page.evaluate(() => {
    const getter = (
      window as unknown as {
        __LINKGO_SQL_RATE_LIMIT_EVENTS__?: () => RateLimitEventRow[];
      }
    ).__LINKGO_SQL_RATE_LIMIT_EVENTS__;
    if (getter === undefined) throw new Error("Rate-limit events unavailable");
    return getter();
  });
}

async function getStateCounts(page: Page): Promise<{ scheduleJobs: number }> {
  return page.evaluate(() => {
    const getter = (
      window as unknown as {
        __LINKGO_SQL_STATE_COUNTS__?: () => { scheduleJobs: number };
      }
    ).__LINKGO_SQL_STATE_COUNTS__;
    if (getter === undefined) throw new Error("SQL state counts unavailable");
    return getter();
  });
}

async function getErrorQueueItems(page: Page): Promise<ErrorQueueItemRow[]> {
  return page.evaluate(() => {
    const getter = (
      window as unknown as {
        __LINKGO_SQL_ERROR_QUEUE_ITEMS__?: () => ErrorQueueItemRow[];
      }
    ).__LINKGO_SQL_ERROR_QUEUE_ITEMS__;
    if (getter === undefined) throw new Error("Error queue items unavailable");
    return getter();
  });
}

test("Safety reconciles an outcome-unknown publish only after typed confirmation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_PUBLISH_EXECUTIONS__ = [
      {
        id: 7,
        kind: "post",
        subjectId: 3,
        campaignId: 1,
        campaignName: "Launch",
        scheduleJobId: null,
        caller: "scheduler",
        status: "outcome_unknown",
        fence: 2,
        remoteOutcome: "ambiguous",
        remoteStatusCode: 503,
        errorMessage: "LinkedIn API request failed with HTTP 503",
        reservedAt: now,
        sentAt: now,
        updatedAt: now,
      },
      {
        id: 8,
        kind: "comment",
        subjectId: 4,
        campaignId: 1,
        campaignName: "Launch",
        scheduleJobId: null,
        caller: "manual",
        status: "in_flight",
        fence: 1,
        remoteOutcome: "",
        remoteStatusCode: null,
        errorMessage: "",
        reservedAt: now,
        sentAt: now,
        updatedAt: now,
      },
    ];
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openSafety(page);

  await expect(
    page.getByText("Check what happened to these posts"),
  ).toBeVisible();
  const inFlight = page.getByLabel("Comment attempt 8");
  await expect(inFlight.getByText("In progress")).toBeVisible();
  await expect(
    inFlight.getByRole("button", { name: "Check what happened" }),
  ).toHaveCount(0);

  const unknown = page.getByLabel("Post attempt 7");
  await unknown.getByRole("button", { name: "Check what happened" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Confirm what happened to this post",
  });
  await dialog.getByLabel("Posted on LinkedIn").check();
  const submit = dialog.getByRole("button", { name: "Confirm result" });
  await dialog
    .getByLabel("LinkedIn link")
    .fill("https://www.linkedin.com/feed/update/urn:li:share:123/");
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Type “RECONCILE” to confirm").fill("reconcile");
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Type “RECONCILE” to confirm").fill("RECONCILE");
  await submit.click();

  await expect(page.getByLabel("Post attempt 7")).toHaveCount(0);
  const inputs = await page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>)
        .__LINKGO_PUBLISH_EXECUTION_RECONCILE_INPUTS__,
  );
  expect(inputs).toEqual([
    {
      executionId: 7,
      fence: 2,
      resolution: "posted",
      externalUrl: "https://www.linkedin.com/feed/update/urn:li:share:123/",
      confirmation: "RECONCILE",
    },
  ]);
});

async function openSafety(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Safety/ }).click();
  await expect(
    page.getByRole("heading", { name: "Safety", exact: true }),
  ).toBeVisible();
}

async function openAgentRuntime(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^AI assistant/ }).click();
  await expect(
    page.getByRole("heading", { name: "AI assistant", exact: true }),
  ).toBeVisible();
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

async function openApprovals(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Approvals/ }).click();
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
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
  await dialog.getByLabel("Daily post limit").fill("1");
  await dialog
    .getByLabel("Manual keywords")
    .fill("LinkedIn growth, founder content");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function createReadyDraftOnCurrentCampaign(
  page: Page,
  variant: VariantFormInput,
  suffix: string,
): Promise<void> {
  await openQueue(page);
  await addCandidate(page, suffix);
  await openDrafts(page);
  await createDraft(page, variant);
  await page
    .getByRole("button", { name: "Choose this version" })
    .first()
    .click();
  await expect(getBadge(page, "Ready for approval")).toBeVisible();
  const auditPanel = page.getByRole("region", { name: /AI review/ }).first();
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

async function addCandidate(page: Page, suffix: string): Promise<void> {
  await page.getByRole("button", { name: "Add idea" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add idea" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("LinkedIn post URL")
    .fill(`https://www.linkedin.com/posts/example-${suffix}/`);
  await dialog
    .getByLabel("Post text")
    .fill(`This founder post has a sharp ICP signal: ${suffix}.`);
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

async function createDraft(
  page: Page,
  variant: VariantFormInput,
): Promise<void> {
  await page.getByRole("button", { name: "Create draft" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create draft" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Angle")
    .fill("Turn the source post into a tactical lesson");
  await dialog.getByLabel("Notes").fill("Keep the operator tone concrete.");
  await dialog.locator("#draft-variant-0-hook").fill(variant.hook);
  await dialog.locator("#draft-variant-0-body").fill(variant.body);
  await dialog.locator("#draft-variant-0-cta").fill(variant.cta);
  await dialog.locator("#draft-variant-0-hashtags").fill(variant.hashtags);
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(dialog).toBeHidden();
}

async function createReview(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Send for approval" }).click();
  const dialog = page.getByRole("dialog", { name: "Send for approval" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Reviewer notes")
    .fill("Human pass before scheduling.");
  await dialog.getByRole("button", { name: "Send for approval" }).click();
  await expect(dialog).toBeHidden();
}

async function scheduleApproval(
  page: Page,
  scheduledFor: string,
  timezone: string,
): Promise<void> {
  await page.getByRole("button", { name: "Pick a time", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Schedule post" });
  await dialog.getByLabel("Date and time").fill(scheduledFor);
  await dialog.getByLabel("Time zone").fill(timezone);
  await dialog.getByRole("button", { name: "Schedule post" }).click();
  await expect(dialog).toBeHidden();
}

async function scheduleApprovalViaDataApi(
  page: Page,
  input: { approvalId: number; scheduledFor: string; timezone: string },
): Promise<string | null> {
  return page.evaluate(async (scheduleInput) => {
    const testApi = (
      window as unknown as {
        __LINKGO_APPROVAL_TEST_API__?: {
          scheduleApproval: (schedule: typeof scheduleInput) => Promise<number>;
        };
      }
    ).__LINKGO_APPROVAL_TEST_API__;
    if (testApi === undefined) throw new Error("Approval test API unavailable");

    try {
      await testApi.scheduleApproval(scheduleInput);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, input);
}

async function createDryRun(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "New assistant task" })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "New assistant task" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("What should the assistant do?")
    .selectOption("researcher");
  await dialog
    .getByLabel("Instructions")
    .fill("Check this campaign is ready for the AI assistant.");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();
}
