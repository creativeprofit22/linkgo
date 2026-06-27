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
  await page.getByRole("button", { name: "Reject", exact: true }).last().click();

  const history = page.locator("section.space-y-3").filter({
    has: page.getByRole("heading", { name: "History", exact: true }),
  });
  await expect(history).toBeVisible();
  await expect(
    history.locator("span").filter({ hasText: /^Rejected$/ }),
  ).toBeVisible();
  await expect(history.getByRole("button", { name: "Cancel" })).toBeDisabled();
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
  await expect(page.getByText("Manual attempt history")).toBeVisible();
  await expect(page.getByText("comment-success")).toBeVisible();

  const attempts = await getCommentAttempts(page);
  expect(attempts).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: "succeeded" })]),
  );
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

test("Global kill switch hides posted action and data API blocks successful attempts", async ({
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
    page.getByRole("button", { name: "Record posted" }),
  ).toBeHidden();
  await expect(
    page.getByText("Record posted is hidden by the global kill switch"),
  ).toBeVisible();

  const message = await recordCommentAttemptViaDataApi(page, {
    commentThreadId: 1,
    status: "succeeded",
    externalCommentUrl: "https://www.linkedin.com/feed/update/blocked-comment/",
  });
  expect(message).toContain("Global kill switch is enabled");

  const rateLimitEvents = await getRateLimitEvents(page);
  expect(
    rateLimitEvents.some(
      (event) => event.action === "comment" && event.decision === "blocked",
    ),
  ).toBe(true);
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
  options: { campaignExists?: boolean } = {},
): Promise<void> {
  if (!options.campaignExists) await createCampaign(page);
  await openQueue(page);
  await page.getByRole("button", { name: "Add candidate" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add candidate" });
  await expect(dialog).toBeVisible();
  await page
    .getByLabel("LinkedIn post URL")
    .fill(`https://www.linkedin.com/posts/example-${suffix}/`);
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

async function recordCommentAttemptViaDataApi(
  page: Page,
  input: {
    commentThreadId: number;
    status: "succeeded" | "failed";
    externalCommentUrl?: string;
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
