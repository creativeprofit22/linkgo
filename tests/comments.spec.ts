import { expect, test, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

test("Comments tab renders no-campaign and empty states", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openComments(page);

  await expect(
    page.getByText("No campaigns yet", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Open Campaigns first")).toBeVisible();

  await createCampaign(page);
  await openComments(page);
  await expect(
    page.getByText("No comment threads yet", { exact: true }),
  ).toBeVisible();
});

test("A shortlisted candidate can become a comment thread with variants and audits", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createShortlistedCandidate(page, "first");
  await openComments(page);

  await createCommentThread(page, cleanComment(), secondCleanComment());

  await expect(
    page.getByRole("heading", { name: /Reply to Jane first/ }),
  ).toBeVisible();
  await expect(page.getByText(cleanComment()).first()).toBeVisible();
  await expect(page.getByText(secondCleanComment()).first()).toBeVisible();
  await expect(page.getByText("required text").first()).toBeVisible();
  await expect(page.getByText("external link").first()).toBeVisible();

  const counts = await getStateCounts(page);
  expect(counts.commentThreads).toBe(1);
  expect(counts.commentVariants).toBe(2);
  expect(counts.commentAudits).toBeGreaterThan(0);
});

test("Comment thread notes can be edited and persist after reopening Comments", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createShortlistedCandidate(page, "notes");
  await openComments(page);
  await createCommentThread(page, cleanComment());

  await page.getByLabel("Operator notes").fill("Updated operator context.");
  await page.getByLabel("Reviewer notes").fill("Reviewer follow-up note.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByRole("button", { name: "Save notes" })).toBeDisabled();

  await openCampaigns(page);
  await openComments(page);
  await expect(page.getByLabel("Operator notes")).toHaveValue(
    "Updated operator context.",
  );
  await expect(page.getByLabel("Reviewer notes")).toHaveValue(
    "Reviewer follow-up note.",
  );
});

test("A blocked comment variant cannot be selected or submitted for review", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createShortlistedCandidate(page, "blocked");
  await openComments(page);
  await createCommentThread(
    page,
    "I would read more at https://example.com because this post names a useful 3-step workflow.",
  );

  await expect(getBadge(page, "Blocked").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeDisabled();
  await expect(getBadge(page, "Needs review")).toBeHidden();
});

test("A rejected comment thread moves to History with Cancel disabled", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createShortlistedCandidate(page, "rejected");
  await openComments(page);
  await createCommentThread(page, cleanComment());
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page
    .getByRole("button", { name: "Reject", exact: true })
    .last()
    .click();

  const history = page.locator("section.space-y-3").filter({
    has: page.getByRole("heading", { name: "History", exact: true }),
  });
  await expect(history).toBeVisible();
  await expect(
    history.locator("span").filter({ hasText: /^Rejected$/ }),
  ).toBeVisible();
  await expect(history.getByRole("button", { name: "Cancel" })).toBeDisabled();
});

test("Approved comment posts through mocked LinkedIn API and records success", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "api-success");

  await page.getByRole("button", { name: "Post via LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Post comment" });
  await expect(dialog.getByText("Exact escaped comment preview")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Post via LinkedIn" }),
  ).toBeDisabled();
  await dialog.getByLabel(/Type “Post comment”/).fill("Post comment");
  await dialog.getByRole("button", { name: "Post via LinkedIn" }).click();

  await expect(getBadge(page, "Posted")).toBeVisible();
  await expect(page.getByText("Comment attempt history")).toBeVisible();
  const attempts = await getCommentAttempts(page);
  expect(attempts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: "succeeded",
        idempotency_key: "comment-thread:1:linkedin:manual",
      }),
    ]),
  );
  await expect.poll(() => getCommentPublishInvokeCount(page)).toBe(1);
});

test("Open outcome_unknown publish execution locks comment API posting", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_PUBLISH_EXECUTIONS__ = [
      {
        id: 51,
        kind: "comment",
        subjectId: 1,
        campaignId: 1,
        campaignName: "Launch",
        scheduleJobId: null,
        caller: "manual",
        status: "outcome_unknown",
        fence: 1,
        remoteOutcome: "ambiguous",
        remoteStatusCode: 503,
        errorMessage: "LinkedIn API request failed with HTTP 503",
        reservedAt: now,
        sentAt: now,
        updatedAt: now,
      },
    ];
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "locked-by-execution");

  await expect(
    page.getByRole("button", { name: "Post via LinkedIn" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Awaiting reconciliation in Safety"),
  ).toBeVisible();
  await expect.poll(() => getCommentPublishInvokeCount(page)).toBe(0);
});

test("LinkedIn API comment failure records failed attempt and Safety error", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "api-failure");
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_LINKEDIN_COMMENT_ERROR__?: string }
    ).__LINKGO_LINKEDIN_COMMENT_ERROR__ =
      "LinkedIn Community Management access or w_member_social_feed scope required";
  });

  await page.getByRole("button", { name: "Post via LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Post comment" });
  await dialog.getByLabel(/Type “Post comment”/).fill("Post comment");
  await dialog.getByRole("button", { name: "Post via LinkedIn" }).click();

  await expect(page.getByText("LinkedIn comment failed")).toBeVisible();
  const attempts = await getCommentAttempts(page);
  expect(attempts).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: "failed" })]),
  );
  await openSafety(page);
  await expect(
    page.getByRole("heading", { name: "Comment attempt failed" }),
  ).toBeVisible();
});

test("A clean variant can be reviewed approved and manually recorded posted", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "posted");

  await page.getByRole("button", { name: "Record posted" }).click();
  const dialog = page.getByRole("dialog", { name: "Record posted comment" });
  await expect(
    dialog.getByRole("button", { name: "Record attempt" }),
  ).toBeDisabled();
  await expect(
    dialog.getByText("Add a comment URL or platform comment ID."),
  ).toBeVisible();
  await dialog.getByLabel("Platform comment ID").fill("comment-success-id");
  await expect(
    dialog.getByRole("button", { name: "Record attempt" }),
  ).toBeEnabled();
  await dialog.getByLabel("Platform comment ID").fill("");
  await expect(
    dialog.getByRole("button", { name: "Record attempt" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Comment URL")
    .fill("https://www.linkedin.com/feed/update/comment-success/");
  await dialog.getByRole("button", { name: "Record attempt" }).click();

  await expect(getBadge(page, "Posted")).toBeVisible();
  await expect(page.getByText("Comment attempt history")).toBeVisible();
  await expect(page.getByText("comment-success")).toBeVisible();

  const attempts = await getCommentAttempts(page);
  expect(attempts).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]),
  );
  expect(await getCommentRecordAttemptInvokeCount(page)).toBe(1);
});

test("Duplicate comment attempt returns a stable domain error", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "duplicate-attempt");
  const attempt = {
    commentThreadId: 1,
    status: "failed" as const,
    idempotencyKey: "comment-thread:1:linkedin:test-duplicate",
    errorMessage: "Injected retryable failure",
  };

  expect(await recordCommentAttemptViaDataApi(page, attempt)).toBe("");
  expect(await recordCommentAttemptViaDataApi(page, attempt)).toBe(
    "Comment attempt was already recorded",
  );
  expect(await getCommentRecordAttemptInvokeCount(page)).toBe(2);
  expect(await getCommentAttempts(page)).toHaveLength(1);
});

test("Daily comment cap blocks a second same-day successful posted attempt", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createShortlistedCandidate(page, "cap-one");
  await openComments(page);

  await createCommentThread(page, cleanComment());
  await selectApproveAndRecordPosted(
    page,
    "https://www.linkedin.com/feed/update/comment-one/",
  );

  await createShortlistedCandidate(page, "cap-two", { campaignExists: true });
  await openComments(page);
  await createCommentThread(page, secondCleanComment());
  await page
    .getByRole("button", { name: "Select", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Submit for review" }).first().click();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await page.getByRole("button", { name: "Record posted" }).first().click();
  await page
    .getByLabel("Comment URL")
    .fill("https://www.linkedin.com/feed/update/comment-two/");
  await page.getByRole("button", { name: "Record attempt" }).click();

  await expect(page.getByText("Daily comment limit reached")).toBeVisible();
  const rateLimitEvents = await getRateLimitEvents(page);
  expect(
    rateLimitEvents.some(
      (event) => event.action === "comment" && event.decision === "blocked",
    ),
  ).toBe(true);
  const attempts = await getCommentAttempts(page);
  expect(
    attempts.filter((attempt) => attempt.status === "succeeded"),
  ).toHaveLength(1);
});

test("Global kill switch hides API posting and direct publish blocks before native", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "kill-switch");
  await openSafety(page);
  await page
    .getByLabel("Kill switch reason")
    .fill("Pause comments for review.");
  await page.getByRole("button", { name: "Enable kill switch" }).click();

  await openComments(page);
  await expect(
    page.getByRole("button", { name: "Post via LinkedIn" }),
  ).toBeHidden();
  await expect(
    page.getByText("Post via LinkedIn is hidden by the global kill switch"),
  ).toBeVisible();

  const message = await publishCommentViaLinkedInDataApi(page, {
    commentThreadId: 1,
    commentary: cleanComment(),
    targetUrn: "urn:li:activity:1001",
    idempotencyKey: "comment-thread:1:linkedin:manual",
  });
  expect(message).toContain("Global kill switch is enabled");
  expect(await getCommentPublishInvokeCount(page)).toBe(0);

  const rateLimitEvents = await getRateLimitEvents(page);
  expect(
    rateLimitEvents.some(
      (event) => event.action === "comment" && event.decision === "blocked",
    ),
  ).toBe(true);
});

test("Daily comment cap blocks API posting before native invoke", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "api-cap-one");
  await page.getByRole("button", { name: "Record posted" }).click();
  await page
    .getByLabel("Comment URL")
    .fill("https://www.linkedin.com/feed/update/comment-one/");
  await page.getByRole("button", { name: "Record attempt" }).click();

  await createShortlistedCandidate(page, "api-cap-two", {
    campaignExists: true,
  });
  await openComments(page);
  await createCommentThread(page, secondCleanComment());
  await page
    .getByRole("button", { name: "Select", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Submit for review" }).first().click();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await resetCommentPublishInvokeCount(page);

  const message = await publishCommentViaLinkedInDataApi(page, {
    commentThreadId: 2,
    commentary: secondCleanComment(),
    targetUrn: "urn:li:activity:1002",
    idempotencyKey: "comment-thread:2:linkedin:manual",
  });
  expect(message).toContain("Daily comment limit reached");
  expect(await getCommentPublishInvokeCount(page)).toBe(0);
});

test("Unresolvable target hides API posting and keeps manual fallback", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createShortlistedCandidate(page, "unresolved", {
    unresolvableUrl: true,
  });
  await openComments(page);
  await createCommentThread(page, cleanComment());
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(
    page.getByRole("button", { name: "Post via LinkedIn" }),
  ).toBeHidden();
  await expect(
    page.getByText("LinkedIn target URN could not be resolved"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record posted manually" }),
  ).toBeVisible();
});

test("Stale status preflight prevents direct API comment posting", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "stale");
  await page.getByRole("button", { name: "Cancel" }).click();

  const message = await publishCommentViaLinkedInDataApi(page, {
    commentThreadId: 1,
    commentary: cleanComment(),
    targetUrn: "urn:li:activity:1001",
    idempotencyKey: "comment-thread:1:linkedin:manual",
  });
  expect(message).toContain("Only approved comments can publish via LinkedIn");
  expect(await getCommentPublishInvokeCount(page)).toBe(0);
});

test("Failed comment attempt creates an open error queue item visible in Safety", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "failed");

  await page.getByRole("button", { name: "Record failure" }).click();
  await page
    .getByLabel("Error message")
    .fill("Manual LinkedIn tab was offline.");
  await page.getByRole("button", { name: "Record attempt" }).click();

  await openSafety(page);
  await expect(
    page.getByRole("heading", { name: "Comment attempt failed" }),
  ).toBeVisible();
  await expect(getBadge(page, "open")).toBeVisible();

  const items = await getErrorQueueItems(page);
  expect(items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source_type: "manual",
        source_id: 1,
        status: "open",
        title: "Comment attempt failed",
      }),
    ]),
  );
});

test("Archived campaign blocks comment mutations while history remains visible", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createApprovedComment(page, "archived");
  await openCampaigns(page);
  await page
    .getByRole("button", { name: "Open Founder-led growth actions" })
    .click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(getBadge(page, "Archived")).toBeVisible();

  await openComments(page);
  await expect(
    page.getByRole("heading", { name: /Reply to Jane archived/ }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Archived campaign history is visible, but comment mutations are blocked.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create comment" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Operator notes")).toBeDisabled();
  await expect(page.getByLabel("Reviewer notes")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save notes" })).toBeDisabled();

  const message = await recordCommentAttemptViaDataApi(page, {
    commentThreadId: 1,
    status: "failed",
    errorMessage: "Should be blocked on archived campaigns.",
  });
  expect(message).toBe("Campaign is archived");
});

interface StateCounts {
  commentThreads: number;
  commentVariants: number;
  commentAudits: number;
  commentAttempts: number;
}

interface CommentAttemptRow {
  status: "succeeded" | "failed";
  idempotency_key: string;
}

interface RateLimitEventRow {
  action: string;
  decision: string;
}

interface ErrorQueueItemRow {
  source_type: string;
  source_id: number | null;
  status: string;
  title: string;
}

function cleanComment(): string {
  return "I like the 3-step handoff you described; we saw the same review bottleneck when our founder content moved from notes to approvals.";
}

function secondCleanComment(): string {
  return "We used a 2-person review loop for this exact issue, and the useful part was making the owner visible before drafting started.";
}

async function openCampaigns(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
}

async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();
}

async function openComments(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Comments/ }).click();
  await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible();
}

async function openSafety(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Safety/ }).click();
  await expect(
    page.getByRole("heading", { name: "Safety", exact: true }),
  ).toBeVisible();
}

async function createCampaign(page: Page): Promise<void> {
  await openCampaigns(page);
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("Name").fill("Founder-led growth");
  await page
    .getByLabel("Product")
    .fill("A local-first LinkedIn operations cockpit");
  await page
    .getByLabel("Audience")
    .fill("Solo founders and technical operators");
  await page.getByLabel("Voice").fill("Concrete, concise, practical");
  await page.getByLabel("Tone").fill("Helpful operator");
  await page
    .getByLabel("Manual keywords")
    .fill("LinkedIn growth, founder content");
  await page.getByLabel("Daily comment limit").fill("1");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function createShortlistedCandidate(
  page: Page,
  suffix: string,
  options: { campaignExists?: boolean; unresolvableUrl?: boolean } = {},
): Promise<void> {
  if (!options.campaignExists) await createCampaign(page);
  await openQueue(page);
  await page.getByRole("button", { name: "Add candidate" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add candidate" });
  await expect(dialog).toBeVisible();
  await page
    .getByLabel("LinkedIn post URL")
    .fill(
      options.unresolvableUrl
        ? `https://www.linkedin.com/posts/example-${suffix}/`
        : `https://www.linkedin.com/posts/example-${suffix}-activity-${1000 + (options.campaignExists ? 2 : 1)}-share/`,
    );
  await page
    .getByLabel("Post text")
    .fill(`This founder post has a sharp ICP signal for ${suffix}.`);
  await page.getByLabel("Author name").fill(`Jane ${suffix}`);
  await page
    .getByLabel("Author profile URL")
    .fill(`https://www.linkedin.com/in/jane-${suffix}/`);
  await page.getByLabel("Posted at").fill("2026-06-25");
  await page.getByLabel("Source keyword").fill("founder content");
  await page.getByLabel("Relevance score").fill("87");
  await page.getByLabel("Score reason").fill("Strong audience overlap.");
  await page.getByLabel("Notes").fill("Good comment opportunity.");
  await dialog.getByRole("button", { name: "Add candidate" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Shortlist" }).first().click();
  await expect(
    page.getByText("Shortlisted", { exact: true }).first(),
  ).toBeVisible();
}

async function createCommentThread(
  page: Page,
  ...variants: string[]
): Promise<void> {
  await page.getByRole("button", { name: "Create comment" }).click();
  const dialog = page.getByRole("dialog", { name: "Create comment" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Operator notes").fill("Manual reply context.");
  for (const [index, variant] of variants.entries()) {
    if (index > 0)
      await dialog.getByRole("button", { name: "Add variant" }).click();
    await dialog.getByLabel(`Variant ${index + 1}`).fill(variant);
  }
  await dialog.getByRole("button", { name: "Create comment" }).click();
  await expect(dialog).toBeHidden();
}

async function createApprovedComment(
  page: Page,
  suffix: string,
): Promise<void> {
  await createShortlistedCandidate(page, suffix);
  await openComments(page);
  await createCommentThread(page, cleanComment());
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(getBadge(page, "Needs review")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
}

async function selectApproveAndRecordPosted(
  page: Page,
  url: string,
): Promise<void> {
  await page
    .getByRole("button", { name: "Select", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Submit for review" }).first().click();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await page.getByRole("button", { name: "Record posted" }).first().click();
  await page.getByLabel("Comment URL").fill(url);
  await page.getByRole("button", { name: "Record attempt" }).click();
  await expect(getBadge(page, "Posted").first()).toBeVisible();
}

function getBadge(page: Page, name: string) {
  return page.locator("span").filter({ hasText: new RegExp(`^${name}$`) });
}

async function getStateCounts(page: Page): Promise<StateCounts> {
  return page.evaluate(() => {
    const getCounts = (
      window as unknown as { __LINKGO_SQL_STATE_COUNTS__?: () => StateCounts }
    ).__LINKGO_SQL_STATE_COUNTS__;
    const counts = getCounts?.();
    if (counts === undefined) throw new Error("State counts unavailable");
    return counts;
  });
}

async function getCommentAttempts(page: Page): Promise<CommentAttemptRow[]> {
  return page.evaluate(() => {
    const getAttempts = (
      window as unknown as {
        __LINKGO_SQL_COMMENT_ATTEMPTS__?: () => CommentAttemptRow[];
      }
    ).__LINKGO_SQL_COMMENT_ATTEMPTS__;
    return getAttempts?.() ?? [];
  });
}

async function getRateLimitEvents(page: Page): Promise<RateLimitEventRow[]> {
  return page.evaluate(() => {
    const getEvents = (
      window as unknown as {
        __LINKGO_SQL_RATE_LIMIT_EVENTS__?: () => RateLimitEventRow[];
      }
    ).__LINKGO_SQL_RATE_LIMIT_EVENTS__;
    return getEvents?.() ?? [];
  });
}

async function getErrorQueueItems(page: Page): Promise<ErrorQueueItemRow[]> {
  return page.evaluate(() => {
    const getItems = (
      window as unknown as {
        __LINKGO_SQL_ERROR_QUEUE_ITEMS__?: () => ErrorQueueItemRow[];
      }
    ).__LINKGO_SQL_ERROR_QUEUE_ITEMS__;
    return getItems?.() ?? [];
  });
}

async function getCommentRecordAttemptInvokeCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number(
      (
        window as unknown as {
          __LINKGO_COMMENT_RECORD_ATTEMPT_INVOKES__?: number;
        }
      ).__LINKGO_COMMENT_RECORD_ATTEMPT_INVOKES__ ?? 0,
    ),
  );
}

async function getCommentPublishInvokeCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number(
      (window as unknown as { __LINKGO_LINKEDIN_COMMENT_INVOKES__?: number })
        .__LINKGO_LINKEDIN_COMMENT_INVOKES__ ?? 0,
    ),
  );
}

async function resetCommentPublishInvokeCount(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_LINKEDIN_COMMENT_INVOKES__?: number }
    ).__LINKGO_LINKEDIN_COMMENT_INVOKES__ = 0;
  });
}

async function publishCommentViaLinkedInDataApi(
  page: Page,
  input: {
    commentThreadId: number;
    commentary: string;
    targetUrn: string;
    idempotencyKey: string;
  },
): Promise<string> {
  await page.waitForFunction(
    () => "__LINKGO_LINKEDIN_ACTIONS_TEST_API__" in window,
  );
  return page.evaluate(async (publishInput) => {
    const api = (
      window as unknown as {
        __LINKGO_LINKEDIN_ACTIONS_TEST_API__?: {
          publishLinkedInComment: (
            input: typeof publishInput,
          ) => Promise<unknown>;
        };
      }
    ).__LINKGO_LINKEDIN_ACTIONS_TEST_API__;
    if (api === undefined)
      return "LinkedIn actions test API was not initialized";
    try {
      await api.publishLinkedInComment(publishInput);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, input);
}

async function recordCommentAttemptViaDataApi(
  page: Page,
  input: {
    commentThreadId: number;
    status: "succeeded" | "failed";
    externalCommentUrl?: string;
    idempotencyKey?: string;
    errorMessage?: string;
  },
): Promise<string> {
  await page.waitForFunction(() => "__LINKGO_COMMENT_TEST_API__" in window);
  return page.evaluate(async (attemptInput) => {
    const api = (
      window as unknown as {
        __LINKGO_COMMENT_TEST_API__?: {
          recordCommentAttempt: (input: typeof attemptInput) => Promise<number>;
        };
      }
    ).__LINKGO_COMMENT_TEST_API__;
    if (api === undefined) return "Comment test API was not initialized";
    try {
      await api.recordCommentAttempt(attemptInput);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, input);
}
