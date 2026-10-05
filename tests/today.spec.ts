import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

/**
 * Today screen. Each source is fed synthetic native rows by wrapping the
 * mocked Tauri `invoke` for the read commands Today's summaries use; every
 * other command still goes to the shared mocks.
 */

type Failable<T> = T[] | "fail";

interface TodayFixture {
  approvals?: Failable<Record<string, unknown>>;
  scheduleJobs?: Record<string, unknown>[];
  /** Eligible rows; also the missing-results rows (none have metrics). */
  eligible?: Failable<Record<string, unknown>>;
  /** Uncapped missing-results total; defaults to the eligible row count. */
  missingTotal?: number;
  executions?: Failable<Record<string, unknown>>;
  accounts?: Failable<Record<string, unknown>>;
  /** Holds every Today read open until the test releases it. */
  hold?: boolean;
  /** Hides the setup row, as if the user picked "Hide setup". */
  hideSetup?: boolean;
}

const NOW = "2026-10-05T09:00:00.000Z";
const CAMPAIGN = "Launch";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(60_000);

async function installFixture(
  page: Page,
  fixture: TodayFixture,
): Promise<void> {
  await page.addInitScript((initial: TodayFixture) => {
    const w = window as unknown as Record<string, unknown> & {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
    };
    w.__TODAY_FIXTURE__ = initial;
    if (initial.hideSetup) {
      window.localStorage.setItem(
        "linkgo.setup.preferences",
        JSON.stringify({ dismissed: true }),
      );
    }
    const internals = w.__TAURI_INTERNALS__;
    const original = internals.invoke.bind(internals);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    w.__TODAY_RELEASE__ = () => release();

    const fixture = (): TodayFixture => w.__TODAY_FIXTURE__ as TodayFixture;
    const answer = async (
      value: unknown[] | "fail" | undefined,
      fallback: () => Promise<unknown>,
      shape: (rows: unknown[]) => unknown = (rows) => rows,
    ): Promise<unknown> => {
      if (fixture().hold) await gate;
      if (value === "fail") throw new Error("Injected Today read failure");
      return value === undefined ? fallback() : shape(value);
    };

    internals.invoke = (cmd: string, args?: unknown): Promise<unknown> => {
      const current = fixture();
      const passthrough = (): Promise<unknown> => original(cmd, args);
      if (cmd === "linkgo_approval_list")
        return answer(current.approvals, passthrough, (rows) => ({
          rows,
          scheduleJobs: current.scheduleJobs ?? [],
          publishAttempts: [],
          linkedAgentRunCounts: [],
          audits: [],
          totalCount: rows.length,
        }));
      if (cmd === "linkgo_metrics_eligible_approvals")
        return answer(current.eligible, passthrough);
      if (cmd === "linkgo_metrics_posts_missing_results")
        return answer(current.eligible, passthrough, (rows) => ({
          items: (rows as Record<string, unknown>[]).map((row) => ({
            approval_id: row.approval_id,
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            variant_hook: row.variant_hook,
            publish_created_at: row.publish_created_at,
          })),
          totalCount: current.missingTotal ?? rows.length,
        }));
      if (cmd === "linkgo_publish_execution_list_open")
        return answer(current.executions, passthrough);
      if (cmd === "linkgo_auth_status") {
        const accounts = current.accounts;
        if (accounts === undefined) return passthrough();
        return answer(accounts, passthrough, (rows) =>
          passthrough().then((status) => ({
            ...(status as Record<string, unknown>),
            accounts: rows,
          })),
        );
      }
      return passthrough();
    };
  }, fixture);
}

async function setFixture(
  page: Page,
  patch: Partial<TodayFixture>,
): Promise<void> {
  await page.evaluate((next) => {
    const w = window as unknown as { __TODAY_FIXTURE__: TodayFixture };
    w.__TODAY_FIXTURE__ = { ...w.__TODAY_FIXTURE__, ...next };
  }, patch);
}

/** Creates campaign 1 so deep links into campaign screens resolve. */
async function openTodayWithCampaign(page: Page): Promise<void> {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await page.evaluate(async (name) => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
    };
    await w.__TAURI_INTERNALS__.invoke("linkgo_campaign_create", {
      input: {
        name,
        product: "A local-first LinkedIn cockpit",
        audience: "Founders",
        voice: "Plain",
        tone: "Helpful",
        autoPilot: false,
        dailyPostLimit: 1,
        dailyCommentLimit: 5,
        keywords: [],
      },
    });
  }, CAMPAIGN);
  await page.evaluate(() => {
    window.location.hash = "#/today";
  });
  await expect(today(page)).toHaveAttribute("data-state", "ready");
}

async function openToday(page: Page): Promise<void> {
  await page.goto("/#/today", { waitUntil: "domcontentloaded" });
}

function today(page: Page): Locator {
  return page.getByTestId("today");
}

function row(page: Page, kind: string): Locator {
  return page.getByTestId(`today-item-${kind}`);
}

function approvalRow(
  id: number,
  hook: string,
  status: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    campaign_id: 1,
    draft_id: id,
    draft_variant_id: id,
    draft_candidate_post_id: id,
    draft_angle: "Angle",
    draft_notes: "",
    draft_status: "ready_for_review",
    campaign_name: CAMPAIGN,
    campaign_status: "active",
    candidate_source_keyword: "founder content",
    target_url: "https://www.linkedin.com/posts/example-activity-123/",
    target_author_name: "Jane Operator",
    target_author_profile_url: "https://www.linkedin.com/in/jane-operator/",
    target_content: "A founder post.",
    variant_number: 1,
    variant_hook: hook,
    variant_body: "Body text.",
    variant_cta: "",
    variant_hashtags: "",
    variant_status: "selected",
    created_at: NOW,
    updated_at: NOW,
    id,
    status,
    reviewed_content_revision: status === "needs_review" ? null : 1,
    current_content_revision: 1,
    readiness: 1,
    reviewer_notes: "",
    approved_at: status === "needs_review" ? null : NOW,
    rejected_at: null,
    ...extra,
  };
}

function scheduleJob(
  approvalId: number,
  scheduledFor: string,
  timezone = "UTC",
) {
  return {
    id: approvalId,
    approval_id: approvalId,
    platform: "linkedin",
    scheduled_for: scheduledFor,
    timezone,
    status: "scheduled",
    idempotency_key: `job-${approvalId}`,
    attempt_count: 0,
    max_attempts: 3,
    next_attempt_at: null,
    last_attempted_at: null,
    last_error: "",
    locked_at: null,
    locked_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

function eligibleRow(approvalId: number, hook: string) {
  return {
    campaign_name: CAMPAIGN,
    campaign_status: "active",
    approval_status: "published",
    draft_id: approvalId,
    draft_angle: "Angle",
    draft_notes: "",
    variant_id: approvalId,
    variant_number: 1,
    variant_hook: hook,
    variant_body: "Body text.",
    variant_cta: "",
    variant_hashtags: "",
    variant_status: "selected",
    target_author_name: "Jane Operator",
    target_author_profile_url: "https://www.linkedin.com/in/jane-operator/",
    target_content: "A founder post.",
    target_url: "https://www.linkedin.com/posts/example-activity-123/",
    campaign_id: 1,
    approval_id: approvalId,
    publish_attempt_id: approvalId,
    publish_external_post_url:
      "https://www.linkedin.com/feed/update/urn:li:share:1/",
    publish_platform_post_id: "urn:li:share:1",
    publish_created_at: NOW,
  };
}

function unclearExecution(id: number, subjectId: number) {
  return {
    id,
    kind: "post",
    subjectId,
    campaignId: 1,
    campaignName: CAMPAIGN,
    scheduleJobId: null,
    caller: "manual",
    status: "outcome_unknown",
    fence: 1,
    remoteOutcome: "",
    remoteStatusCode: null,
    errorMessage: "",
    reservedAt: NOW,
    sentAt: NOW,
    updatedAt: NOW,
  };
}

function account(providerKey: string, label: string, status: string) {
  return {
    id: 1,
    provider_key: providerKey,
    provider_label: label,
    auth_method: providerKey === "linkedin" ? "oauth" : "api_key",
    status,
    scopes: "",
    account_label: `${label} account`,
    account_id: "acct-1",
    expires_at: null,
    refresh_expires_at: null,
    has_base_url_override: false,
    last_checked_at: NOW,
    last_error: "",
    created_at: NOW,
    updated_at: NOW,
  };
}

const EMPTY: TodayFixture = {
  approvals: [],
  eligible: [],
  executions: [],
  accounts: [],
  hideSetup: true,
};

test("broken LinkedIn shows a Reconnect item that opens the connect dialog", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    accounts: [account("linkedin", "LinkedIn", "expired")],
  });
  await openToday(page);

  const item = row(page, "connection");
  await expect(item).toContainText("LinkedIn needs reconnecting");
  await expect(item.getByRole("link")).toHaveCount(1);
  await item.getByRole("link", { name: "Reconnect" }).click();

  await expect(page).toHaveURL(/#\/integrations\?connect=linkedin$/);
  await expect(
    page.getByRole("dialog", { name: "LinkedIn connection" }),
  ).toBeVisible();
});

test("an AI sign-in that needs renewing shows a Reconnect item", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    accounts: [account("anthropic", "Anthropic", "reauth_required")],
  });
  await openToday(page);

  const item = row(page, "connection");
  await expect(item).toContainText("Anthropic needs reconnecting");
  await expect(item.getByRole("link", { name: "Reconnect" })).toHaveAttribute(
    "href",
    "#/integrations?connect=anthropic",
  );
});

test("a post with an unclear outcome links to its Safety check", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    approvals: [approvalRow(7, "Pricing lessons", "approved")],
    executions: [unclearExecution(41, 7)],
  });
  await openTodayWithCampaign(page);

  const item = row(page, "unclear-outcome");
  await expect(item).toContainText("Did “Pricing lessons” go out?");
  await expect(item.getByRole("link")).toHaveCount(1);
  await item.getByRole("link", { name: "Check what happened" }).click();

  await expect(page).toHaveURL(/#\/safety\?executionId=41$/);
  await expect(
    page.getByRole("dialog", { name: "Confirm what happened to this post" }),
  ).toBeVisible();
});

test("a post waiting for OK opens Approvals with that post highlighted", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    approvals: [approvalRow(3, "Hiring my first engineer", "needs_review")],
  });
  await openTodayWithCampaign(page);

  const item = row(page, "waiting");
  await expect(item).toContainText(
    "“Hiring my first engineer” is waiting for your OK",
  );
  await expect(item.getByRole("link")).toHaveCount(1);
  await item.getByRole("link", { name: "Review post" }).click();

  await expect(page).toHaveURL(/#\/approvals\?approvalId=3&campaignId=1$/);
  await expect(page.locator("#approval-3")).toHaveAttribute(
    "data-highlighted",
    "true",
  );
});

test("a posted post without results opens Add results with it picked", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    eligible: [
      eligibleRow(4, "An older post"),
      eligibleRow(5, "What churn taught us"),
    ],
  });
  await openTodayWithCampaign(page);

  const item = row(page, "results-missing").filter({
    hasText: "What churn taught us",
  });
  await expect(item).toContainText("Add results for “What churn taught us”");
  await expect(item.getByRole("link")).toHaveCount(1);
  await item.getByRole("link", { name: "Add results" }).click();

  await expect(page).toHaveURL(/#\/metrics\?approvalId=5&campaignId=1$/);
  const dialog = page.getByRole("dialog", { name: "Add results" });
  await expect(dialog).toBeVisible();
  // Picked for the person; nothing is saved until they submit.
  await expect(dialog.locator("#metric-approval")).toHaveValue("5");
});

test("See all counts every post missing results, not only the loaded ones", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    eligible: [1, 2, 3, 4, 5, 6].map((id) => eligibleRow(id, `Post ${id}`)),
    missingTotal: 120,
  });
  await openToday(page);

  await expect(row(page, "results-missing")).toHaveCount(5);
  await expect(
    page.getByTestId("today-overflow-results-missing"),
  ).toContainText("115 more posts need results.");
});

test("the next scheduled post shows under Coming up and links to it", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    approvals: [approvalRow(9, "Our 2027 roadmap", "scheduled")],
    scheduleJobs: [scheduleJob(9, "2099-01-02T15:00:00.000Z")],
  });
  await openTodayWithCampaign(page);

  await expect(page.getByTestId("today-empty")).toBeVisible();
  const item = row(page, "next-scheduled");
  await expect(item).toContainText("Next post: “Our 2027 roadmap”");
  await item.getByRole("link", { name: "See schedule" }).click();

  await expect(page).toHaveURL(/#\/approvals\?approvalId=9&campaignId=1$/);
  await expect(page.locator("#approval-9")).toHaveAttribute(
    "data-highlighted",
    "true",
  );
});

test.describe("in a browser outside the post's time zone", () => {
  test.use({ timezoneId: "Europe/London" });

  test("the next post shows the wall time it was scheduled for", async ({
    page,
  }) => {
    await installFixture(page, {
      ...EMPTY,
      approvals: [approvalRow(9, "Our 2027 roadmap", "scheduled")],
      scheduleJobs: [scheduleJob(9, "2026-10-06T09:00", "America/New_York")],
    });
    await openTodayWithCampaign(page);

    const item = row(page, "next-scheduled");
    await expect(item).toContainText("9:00");
    await expect(item).toContainText("(America/New_York)");
    await expect(item).not.toContainText("4:00");
  });
});

test("unfinished setup shows one Finish setup item first", async ({ page }) => {
  await installFixture(page, {
    ...EMPTY,
    hideSetup: false,
    approvals: [approvalRow(3, "Hiring my first engineer", "needs_review")],
  });
  await openToday(page);

  const items = today(page).locator("[data-testid^='today-item-']");
  await expect(items.first()).toHaveAttribute(
    "data-testid",
    "today-item-setup",
  );
  const setup = row(page, "setup");
  await expect(setup).toContainText(/of 4 steps done/);
  await expect(
    setup.getByRole("link", { name: "Finish setup" }),
  ).toHaveAttribute("href", "#/setup");
});

test("a fresh start lands on Today with setup first", async ({ page }) => {
  await installFixture(page, { ...EMPTY, hideSetup: false });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/#\/today$/);
  await expect(
    page
      .getByRole("navigation", { name: "Main menu" })
      .getByRole("button", { name: /^Today/ }),
  ).toHaveAttribute("aria-current", "page");
  await expect(row(page, "setup")).toBeVisible();
});

test("orders items by urgency", async ({ page }) => {
  await installFixture(page, {
    ...EMPTY,
    accounts: [account("linkedin", "LinkedIn", "expired")],
    approvals: [
      approvalRow(3, "Hiring my first engineer", "needs_review"),
      approvalRow(7, "Pricing lessons", "approved"),
    ],
    executions: [unclearExecution(41, 7)],
    eligible: [eligibleRow(5, "What churn taught us")],
  });
  await openToday(page);

  await expect(page.getByTestId("today-count")).toHaveText("4 things need you");
  const kinds = await today(page)
    .getByRole("list", { name: "Things that need you" })
    .locator("[data-testid^='today-item-']")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.testid));
  expect(kinds).toEqual([
    "today-item-connection",
    "today-item-unclear-outcome",
    "today-item-waiting",
    "today-item-results-missing",
  ]);
});

test("empty state says all caught up and offers the next step", async ({
  page,
}) => {
  await installFixture(page, EMPTY);
  await openToday(page);

  const empty = page.getByTestId("today-empty");
  await expect(empty).toContainText("You're all caught up");
  await expect(empty.getByRole("link", { name: "Find an idea" })).toBeVisible();
  await expect(
    empty.getByRole("link", { name: "Write a post" }),
  ).toHaveAttribute("href", "#/drafts");
});

test("loading shows a busy skeleton until the reads finish", async ({
  page,
}) => {
  await installFixture(page, { ...EMPTY, hold: true });
  await openToday(page);

  await expect(page.getByTestId("today-loading")).toBeVisible();
  await expect(today(page)).toHaveAttribute("aria-busy", "true");

  await page.evaluate(() => {
    (
      window as unknown as { __TODAY_RELEASE__: () => void }
    ).__TODAY_RELEASE__();
  });
  await expect(page.getByTestId("today-empty")).toBeVisible();
  await expect(today(page)).toHaveAttribute("aria-busy", "false");
});

test("when nothing loads it says so and Try again recovers", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    approvals: "fail",
    eligible: "fail",
    executions: "fail",
    accounts: "fail",
  });
  await openToday(page);

  const error = page.getByTestId("today-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute("role", "alert");

  await setFixture(page, {
    approvals: [approvalRow(3, "Hiring my first engineer", "needs_review")],
    eligible: [],
    executions: [],
    accounts: [],
  });
  await error.getByRole("button", { name: "Try again" }).click();
  await expect(row(page, "waiting")).toBeVisible();
});

test("when one source fails the rest still shows with a notice", async ({
  page,
}) => {
  await installFixture(page, {
    ...EMPTY,
    executions: "fail",
    approvals: [approvalRow(3, "Hiring my first engineer", "needs_review")],
  });
  await openToday(page);

  await expect(row(page, "waiting")).toBeVisible();
  const notice = page.getByTestId("today-partial");
  await expect(notice).toContainText("posts that may not have gone out");

  await setFixture(page, { executions: [] });
  await notice.getByRole("button", { name: "Try again" }).click();
  await expect(notice).toBeHidden();
});
