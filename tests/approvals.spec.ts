import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

type ApprovalAiAuditState =
  | "missing"
  | "running"
  | "failed"
  | "stale"
  | "incomplete"
  | "blocked"
  | "passing";

const approvalAiAuditCases: Array<{
  state: ApprovalAiAuditState;
  eligible: boolean;
}> = [
  { state: "missing", eligible: false },
  { state: "running", eligible: false },
  { state: "failed", eligible: false },
  { state: "stale", eligible: false },
  { state: "incomplete", eligible: false },
  { state: "blocked", eligible: false },
  { state: "passing", eligible: true },
];

test("creates, previews, approves, schedules, and publishes an approval", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, reservedCharacterVariant());
  await openApprovals(page);
  await createReview(page);

  await expect(
    page.getByRole("button", { name: "Publish via LinkedIn" }),
  ).toBeHidden();
  await expect(getBadge(page, "Needs review")).toBeVisible();
  await expect(
    page.getByText(reservedCharacterVariant().hook).first(),
  ).toBeVisible();
  await expect(page.getByText("Variant 1")).toBeVisible();
  await expect(page.getByText("\\@founder")).toBeVisible();
  await expect(page.getByText("\\#Growth")).toBeVisible();
  await expect(page.getByText("\\*useful\\*")).toBeVisible();
  await expect(page.getByText("\\_notes\\_")).toBeVisible();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();

  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByLabel("Scheduled for").fill("2026-06-25T14:30");
  await page.getByLabel("Timezone label").fill("local");
  await page.getByRole("button", { name: "Schedule approval" }).click();
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
  await expect(page.getByText("2026-06-25T14:30 · local")).toBeVisible();

  await page.getByRole("button", { name: "Mark published" }).click();
  await page
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/manual-success/");
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Record attempt" }).click();
  await expect(getBadge(page, "Published")).toBeVisible();
  await expect(getBadge(page, "Succeeded")).toBeVisible();
  await expect(
    page.getByText("https://www.linkedin.com/posts/manual-success/"),
  ).toBeVisible();
});

test("publishes an approved approval through mocked LinkedIn OAuth action", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, reservedCharacterVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Publish via LinkedIn" }).click();

  const dialog = page.getByRole("dialog", { name: "Publish to LinkedIn" });
  await expect(
    dialog.getByText(
      "This will publish to LinkedIn using the connected account.",
    ),
  ).toBeVisible();
  await expect(dialog.getByText("\\@founder")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Publish via LinkedIn" }),
  ).toBeDisabled();

  await dialog.getByLabel("Type “Publish now” to confirm").fill("Publish now");
  await dialog.getByRole("button", { name: "Publish via LinkedIn" }).click();

  await expect(getBadge(page, "Published")).toBeVisible();
  await expect(getBadge(page, "Succeeded")).toBeVisible();
  await expect(
    page.getByText("Platform ID: urn:li:ugcPost:test-1"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish via LinkedIn" }),
  ).toBeHidden();
});

test("records a failed LinkedIn OAuth publish attempt and error queue item", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_LINKEDIN_PUBLISH_ERROR__ = "LinkedIn API rejected the post.";
  });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Publish via LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish to LinkedIn" });
  await dialog.getByLabel("Type “Publish now” to confirm").fill("Publish now");
  await dialog.getByRole("button", { name: "Publish via LinkedIn" }).click();

  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(getBadge(page, "Failed")).toBeVisible();
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "LinkedIn API rejected the post." }),
  ).toBeVisible();
  const counts = await getStateCounts(page);
  expect(counts.publishAttempts).toBe(1);
  expect(counts.errorQueueItems).toBe(1);
});

test("records invalid empty LinkedIn OAuth publish result as a failed attempt", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_LINKEDIN_PUBLISH_RESULT__ = {
      platformPostId: "",
      externalPostUrl: "",
    };
  });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Publish via LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish to LinkedIn" });
  await dialog.getByLabel("Type “Publish now” to confirm").fill("Publish now");
  await dialog.getByRole("button", { name: "Publish via LinkedIn" }).click();

  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(getBadge(page, "Failed")).toBeVisible();
  const counts = await getStateCounts(page);
  expect(counts.publishAttempts).toBe(1);
  expect(counts.errorQueueItems).toBe(1);
});

test("global kill switch hides LinkedIn OAuth publish action", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByRole("button", { name: "Publish via LinkedIn" }),
  ).toBeVisible();

  await openSafety(page);
  await page
    .getByLabel("Kill switch reason")
    .fill("Pause LinkedIn publishing during review.");
  await page.getByRole("button", { name: "Enable kill switch" }).click();
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();

  await openApprovals(page);
  await expect(
    page.getByRole("button", { name: "Publish via LinkedIn" }),
  ).toBeHidden();
});

test("LinkedIn OAuth publish rechecks approval state before submitting", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await countLinkedInPublishInvokes(page);
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Publish via LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish to LinkedIn" });
  await dialog.getByLabel("Type “Publish now” to confirm").fill("Publish now");

  await setApprovalStatusThroughMockSql(page, 1, "changes_requested");
  await dialog.getByRole("button", { name: "Publish via LinkedIn" }).click();

  await expect(page.getByText("LinkedIn publish blocked")).toBeVisible();
  await expect(
    page.getByText(
      "Only approved or scheduled approvals can publish via LinkedIn",
    ),
  ).toBeVisible();
  expect(await getPublishAttemptCount(page)).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
});

test("LinkedIn OAuth publish preflight blocks duplicate successes and stale schedules", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await countLinkedInPublishInvokes(page);
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await scheduleApproval(page, "2026-06-25T14:30", "local");

  const staleScheduleResult = await publishViaTestApi(page, {
    approvalId: 1,
    scheduleJobId: 999,
    commentary: "Stale schedule should be blocked.",
    idempotencyKey: "approval:1:linkedin:stale-schedule",
  });
  expect(staleScheduleResult).toEqual({
    ok: false,
    message: "Schedule job is not the current scheduled job",
  });
  expect(await getPublishAttemptCount(page)).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);

  await page.getByRole("button", { name: "Mark published" }).click();
  await page
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/first-success/");
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Record attempt" }).click();
  await expect(getBadge(page, "Published")).toBeVisible();

  await setApprovalStatusThroughMockSql(page, 1, "approved");
  const duplicateResult = await publishViaTestApi(page, {
    approvalId: 1,
    commentary: "Duplicate success should be blocked.",
    idempotencyKey: "approval:1:linkedin:duplicate-success",
  });
  expect(duplicateResult).toEqual({
    ok: false,
    message: "Approval already has a successful publish attempt",
  });
  expect(await getPublishAttemptCount(page)).toBe(1);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
});

test("LinkedIn OAuth publish rechecks kill switch before submitting", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await countLinkedInPublishInvokes(page);
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Publish via LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish to LinkedIn" });
  await dialog.getByLabel("Type “Publish now” to confirm").fill("Publish now");

  await enableKillSwitchThroughMockSql(
    page,
    "Emergency stop before LinkedIn submission.",
  );
  await dialog.getByRole("button", { name: "Publish via LinkedIn" }).click();

  await expect(page.getByText("LinkedIn publish blocked")).toBeVisible();
  await expect(
    page.getByText(
      "Global kill switch is enabled: Emergency stop before LinkedIn submission.",
    ),
  ).toBeVisible();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(getBadge(page, "Succeeded")).toBeHidden();
  expect(await getPublishAttemptCount(page)).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);

  const directResult = await page.evaluate(async () => {
    const publishLinkedInPost = (
      window as unknown as {
        __LINKGO_LINKEDIN_ACTIONS_TEST_API__?: {
          publishLinkedInPost: (input: {
            approvalId: number;
            commentary: string;
            idempotencyKey: string;
          }) => Promise<unknown>;
        };
      }
    ).__LINKGO_LINKEDIN_ACTIONS_TEST_API__?.publishLinkedInPost;

    if (publishLinkedInPost === undefined) {
      return { ok: false, message: "LinkedIn test API was not initialized" };
    }

    try {
      await publishLinkedInPost({
        approvalId: 1,
        commentary: "Direct bridge should be blocked.",
        idempotencyKey: "approval:1:linkedin:direct-blocked",
      });
      return { ok: true, message: "" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  expect(directResult).toEqual({
    ok: false,
    message:
      "Global kill switch is enabled: Emergency stop before LinkedIn submission.",
  });
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
});

test("successful publish attempts require a LinkedIn URL or platform ID", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Mark published" }).click();

  const dialog = page.getByRole("dialog", { name: "Record publish attempt" });
  const recordButton = dialog.getByRole("button", { name: "Record attempt" });
  await expect(recordButton).toBeDisabled();
  await expect(
    dialog.getByText(
      "LinkedIn URL or platform post ID is required for success",
    ),
  ).toBeVisible();

  await dialog.getByLabel("Platform post ID").fill("manual-success-id");
  await expect(recordButton).toBeEnabled();

  await dialog.getByLabel("Platform post ID").fill("");
  await expect(recordButton).toBeDisabled();

  await dialog
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/manual-success/");
  await expect(recordButton).toBeEnabled();
});

test("failed publish attempts require a failure reason", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Record failure" }).click();

  const dialog = page.getByRole("dialog", { name: "Record publish attempt" });
  const recordButton = dialog.getByRole("button", { name: "Record attempt" });
  await expect(recordButton).toBeDisabled();
  await expect(
    dialog.getByText("Failure reason is required for failed attempts"),
  ).toBeVisible();

  await dialog.getByLabel("Failure reason").fill("Local browser was offline.");
  await expect(recordButton).toBeEnabled();
});

test("published approvals reject duplicate successful publish attempts", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Mark published" }).click();
  await page
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/first-success/");
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Record attempt" }).click();
  await expect(getBadge(page, "Published")).toBeVisible();

  const beforeAttemptCount = await getPublishAttemptCount(page);
  const invokesBeforeDuplicate = await page.evaluate(() =>
    Number(
      (
        window as unknown as {
          __LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__?: number;
        }
      ).__LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__ ?? 0,
    ),
  );
  await page.waitForFunction(() => "__LINKGO_APPROVAL_TEST_API__" in window);
  const result = await page.evaluate(async () => {
    const approvalTestApi = (
      window as unknown as {
        __LINKGO_APPROVAL_TEST_API__?: {
          recordPublishAttempt: (input: {
            approvalId: number;
            status: "succeeded" | "failed";
            externalPostUrl?: string;
            errorMessage?: string;
          }) => Promise<number>;
        };
      }
    ).__LINKGO_APPROVAL_TEST_API__;

    if (approvalTestApi === undefined) {
      return { ok: false, message: "Approval test API was not initialized" };
    }

    try {
      await approvalTestApi.recordPublishAttempt({
        approvalId: 1,
        status: "succeeded",
        externalPostUrl: "https://www.linkedin.com/posts/duplicate-success/",
      });
      return { ok: true, message: "" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const afterRejectedSuccessCount = await getPublishAttemptCount(page);

  expect(result).toEqual({
    ok: false,
    message: "Published approvals can only record failed follow-up attempts",
  });
  expect(afterRejectedSuccessCount).toBe(beforeAttemptCount);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          (
            window as unknown as {
              __LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__?: number;
            }
          ).__LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__ ?? 0,
        ),
      ),
    )
    .toBe(invokesBeforeDuplicate + 1);

  const failedFollowUpResult = await page.evaluate(async () => {
    const approvalTestApi = (
      window as unknown as {
        __LINKGO_APPROVAL_TEST_API__?: {
          recordPublishAttempt: (input: {
            approvalId: number;
            status: "succeeded" | "failed";
            errorMessage?: string;
          }) => Promise<number>;
        };
      }
    ).__LINKGO_APPROVAL_TEST_API__;

    if (approvalTestApi === undefined) {
      return { ok: false, message: "Approval test API was not initialized" };
    }

    try {
      await approvalTestApi.recordPublishAttempt({
        approvalId: 1,
        status: "failed",
        errorMessage: "Follow-up audit failed after publication.",
      });
      return { ok: true, message: "" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const afterFailedFollowUpCount = await getPublishAttemptCount(page);

  expect(failedFollowUpResult).toEqual({ ok: true, message: "" });
  expect(afterFailedFollowUpCount).toBe(beforeAttemptCount + 1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          (
            window as unknown as {
              __LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__?: number;
            }
          ).__LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__ ?? 0,
        ),
      ),
    )
    .toBe(invokesBeforeDuplicate + 2);
});

test("cancelled schedules can be rescheduled with new details", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await scheduleApproval(page, "2026-06-25T14:30", "local");
  await expect(page.getByText("2026-06-25T14:30 · local")).toBeVisible();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Cancel schedule" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(getBadge(page, "Cancelled").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Schedule", exact: true }),
  ).toBeVisible();

  await scheduleApproval(page, "2026-06-26T09:15", "America/New_York");
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
  await expect(
    page.getByText("2026-06-26T09:15 · America/New_York"),
  ).toBeVisible();
  await expect(page.getByText("2026-06-25T14:30 · local")).toBeHidden();
});

test("failed scheduled publish attempts can be rescheduled with new details", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await scheduleApproval(page, "2026-06-25T14:30", "local");
  await expect(page.getByText("2026-06-25T14:30 · local")).toBeVisible();

  await page.getByRole("button", { name: "Record failure" }).click();
  await page.getByLabel("Failure reason").fill("Local browser was offline.");
  await page.getByRole("button", { name: "Record attempt" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(getBadge(page, "Failed").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Schedule", exact: true }),
  ).toBeVisible();

  await scheduleApproval(page, "2026-06-27T10:45", "Europe/London");
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
  await expect(
    page.getByText("2026-06-27T10:45 · Europe/London"),
  ).toBeVisible();
  await expect(page.getByText("2026-06-25T14:30 · local")).toBeHidden();
});

for (const { state, eligible } of approvalAiAuditCases) {
  test(`${state} AI audit enforces approval query and creation readiness`, async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await createReadyDraft(page, cleanVariant());
    await setApprovalAiAuditState(page, state);

    const result = await checkApprovalReadiness(page);

    expect(result.eligibleDraftIds).toEqual(eligible ? [1] : []);
    expect(result.created).toBe(eligible);
    expect(result.error).toBe(
      eligible
        ? ""
        : "Selected variant requires a completed current-revision AI audit with six canonical non-blocking findings",
    );
  });
}

test("blocked variant is not listed as an approval candidate", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page, blockedVariant());
  await openApprovals(page);

  await expect(
    page.getByRole("button", { name: "Create review" }),
  ).toBeDisabled();
  await expect(
    page.getByText("No eligible ready-for-review drafts"),
  ).toBeVisible();
});

test("request changes moves the linked draft back to needs revision", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(getBadge(page, "Changes requested")).toBeVisible();
  await openDrafts(page);

  await expect(getBadge(page, "Needs revision")).toBeVisible();
});

test("archived campaign approvals hide mutation controls with restore guidance", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Schedule", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark published" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record failure" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish via LinkedIn" }),
  ).toBeVisible();

  await archiveSelectedCampaign(page);
  await openApprovals(page);

  await expect(
    page.getByText(
      "Archived campaigns cannot change approvals. Restore the campaign first.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Request changes" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Schedule", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Mark published" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Record failure" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Publish via LinkedIn" }),
  ).toBeHidden();
});

interface VariantFormInput {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

function getBadge(page: Page, label: string): Locator {
  return page
    .locator("span")
    .filter({ hasText: new RegExp(`^${label}$`, "u") });
}

async function countLinkedInPublishInvokes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as {
      __TAURI_INTERNALS__?: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
      __LINKGO_LINKEDIN_PUBLISH_INVOKES__?: number;
    };
    const internals = target.__TAURI_INTERNALS__;
    if (internals === undefined) return;

    const originalInvoke = internals.invoke.bind(internals);
    target.__LINKGO_LINKEDIN_PUBLISH_INVOKES__ = 0;
    internals.invoke = (cmd: string, args?: unknown) => {
      if (cmd === "linkgo_linkedin_publish_post") {
        target.__LINKGO_LINKEDIN_PUBLISH_INVOKES__ =
          (target.__LINKGO_LINKEDIN_PUBLISH_INVOKES__ ?? 0) + 1;
      }
      return originalInvoke(cmd, args);
    };
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

async function setApprovalStatusThroughMockSql(
  page: Page,
  approvalId: number,
  status: "approved" | "changes_requested",
): Promise<void> {
  await page.evaluate(
    async ({ id, nextStatus }) => {
      const invoke = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (cmd: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__?.invoke;

      if (invoke === undefined) {
        throw new Error("Tauri invoke mock was not initialized");
      }

      await invoke("plugin:sql|execute", {
        query: `UPDATE approvals
        SET status = $1, updated_at = datetime('now')
        WHERE id = $2`,
        values: [nextStatus, id],
      });
    },
    { id: approvalId, nextStatus: status },
  );
}

async function publishViaTestApi(
  page: Page,
  input: {
    approvalId: number;
    scheduleJobId?: number;
    commentary: string;
    idempotencyKey: string;
  },
): Promise<{ ok: boolean; message: string }> {
  return page.evaluate(async (publishInput) => {
    const publishLinkedInPost = (
      window as unknown as {
        __LINKGO_LINKEDIN_ACTIONS_TEST_API__?: {
          publishLinkedInPost: (input: typeof publishInput) => Promise<unknown>;
        };
      }
    ).__LINKGO_LINKEDIN_ACTIONS_TEST_API__?.publishLinkedInPost;

    if (publishLinkedInPost === undefined) {
      return { ok: false, message: "LinkedIn test API was not initialized" };
    }

    try {
      await publishLinkedInPost(publishInput);
      return { ok: true, message: "" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }, input);
}

async function enableKillSwitchThroughMockSql(
  page: Page,
  reason: string,
): Promise<void> {
  await page.evaluate(async (killSwitchReason) => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__?.invoke;

    if (invoke === undefined) {
      throw new Error("Tauri invoke mock was not initialized");
    }

    await invoke("plugin:sql|execute", {
      query: `UPDATE safety_settings
      SET global_kill_switch = $1,
        kill_switch_reason = $2,
        updated_at = datetime('now')
      WHERE id = 1`,
      values: [1, killSwitchReason],
    });
  }, reason);
}

async function getPublishAttemptCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const stateCounts = (
      window as unknown as {
        __LINKGO_SQL_STATE_COUNTS__?: () => { publishAttempts: number };
      }
    ).__LINKGO_SQL_STATE_COUNTS__;

    return stateCounts?.().publishAttempts ?? 0;
  });
}

async function getStateCounts(
  page: Page,
): Promise<{ publishAttempts: number; errorQueueItems: number }> {
  return page.evaluate(() => {
    const stateCounts = (
      window as unknown as {
        __LINKGO_SQL_STATE_COUNTS__?: () => {
          publishAttempts: number;
          errorQueueItems: number;
        };
      }
    ).__LINKGO_SQL_STATE_COUNTS__;

    return stateCounts?.() ?? { publishAttempts: 0, errorQueueItems: 0 };
  });
}

function cleanVariant(): VariantFormInput {
  return {
    hook: "We turned 12 customer interviews into one simple sales motion",
    body: "The useful part was not the script. It was the pattern behind the replies.",
    cta: "Save this before your next outbound sprint.",
    hashtags: "#LinkedInGrowth #Sales",
  };
}

function blockedVariant(): VariantFormInput {
  return {
    hook: "We found 12 useful lessons from this customer post",
    body: "Read the full teardown at https://example.com before replying.",
    cta: "Comment with your take.",
    hashtags: "#One #Two #Three #Four #Five #Six",
  };
}

function reservedCharacterVariant(): VariantFormInput {
  return {
    hook: "We turned 12 customer interviews into one useful operator lesson",
    body: "Send this to @founder when *useful* _notes_ beat vague advice.",
    cta: "Save it before your next sprint.",
    hashtags: "#Growth",
  };
}

async function setApprovalAiAuditState(
  page: Page,
  state: ApprovalAiAuditState,
): Promise<void> {
  if (state === "passing") return;
  await page.evaluate(async (nextState) => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__?.invoke;
    if (invoke === undefined) {
      throw new Error("Tauri invoke mock was not initialized");
    }

    const queryByState: Record<
      Exclude<ApprovalAiAuditState, "passing">,
      string
    > = {
      missing: "DELETE FROM draft_ai_audit_runs",
      running: `UPDATE draft_ai_audit_runs
        SET status = 'running', completed_at = NULL, updated_at = datetime('now')`,
      failed: `UPDATE draft_ai_audit_runs
        SET status = 'failed', error_message = 'Audit failed', updated_at = datetime('now')`,
      stale: `UPDATE draft_variants
        SET hook = hook || ' revised', updated_at = datetime('now')
        WHERE status = 'selected'`,
      incomplete: `UPDATE draft_ai_audit_findings
        SET rule_key = 'tone'
        WHERE rule_key = 'safety'`,
      blocked: `UPDATE draft_ai_audit_findings
        SET severity = 'block', message = 'AI audit blocked approval.'
        WHERE rule_key = 'safety'`,
    };
    await invoke("plugin:sql|execute", {
      query: queryByState[nextState],
      values: [],
    });
  }, state);
}

async function checkApprovalReadiness(page: Page): Promise<{
  eligibleDraftIds: number[];
  created: boolean;
  error: string;
}> {
  return page.evaluate(async () => {
    const approvalApi = (
      window as unknown as {
        __LINKGO_APPROVAL_TEST_API__?: {
          createApproval: (input: {
            draftId: number;
            reviewerNotes: string;
          }) => Promise<number>;
          listApprovalEligibleDrafts: (
            campaignId?: number,
          ) => Promise<Array<{ id: number }>>;
        };
      }
    ).__LINKGO_APPROVAL_TEST_API__;
    if (approvalApi === undefined) {
      throw new Error("Approval test API was not initialized");
    }

    const eligibleDrafts = await approvalApi.listApprovalEligibleDrafts(1);
    try {
      await approvalApi.createApproval({
        draftId: 1,
        reviewerNotes: "Audit readiness boundary test.",
      });
      return {
        eligibleDraftIds: eligibleDrafts.map((draft) => draft.id),
        created: true,
        error: "",
      };
    } catch (error) {
      return {
        eligibleDraftIds: eligibleDrafts.map((draft) => draft.id),
        created: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
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
  await page.getByRole("button", { name: "Select for review" }).click();
  await expect(getBadge(page, "Ready for review")).toBeVisible();
  const auditPanel = page.getByRole("region", { name: /AI audit/ });
  await auditPanel.getByRole("button", { name: "Run AI audit" }).click();
  await expect(
    auditPanel.getByText("Completed", { exact: true }),
  ).toBeVisible();
}

async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
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

async function openSafety(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Safety/ }).click();
  await expect(
    page.getByRole("heading", { name: "Safety", exact: true }),
  ).toBeVisible();
}

async function openCampaigns(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
}

async function archiveSelectedCampaign(page: Page): Promise<void> {
  await openCampaigns(page);
  await page.getByRole("button", { name: "Archive" }).first().click();
  await expect(getBadge(page, "Archived")).toBeVisible();
}

async function createCampaign(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "New campaign" }),
  ).toBeVisible();

  await page.getByLabel("Name").fill("Founder-led growth");
  await page
    .getByLabel("Product")
    .fill("A local-first LinkedIn operations cockpit");
  await page.getByLabel("Audience").fill("Solo founders and operators");
  await page.getByLabel("Voice").fill("Concrete, concise, practical");
  await page.getByLabel("Tone").fill("Helpful operator");
  await page
    .getByLabel("Manual keywords")
    .fill("LinkedIn growth, founder content");
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function addCandidate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add candidate" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Add candidate" }),
  ).toBeVisible();

  await page
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/example-activity-123/");
  await page
    .getByLabel("Post text")
    .fill("This founder post has a sharp ICP signal.");
  await page.getByLabel("Author name").fill("Jane Operator");
  await page
    .getByLabel("Author profile URL")
    .fill("https://www.linkedin.com/in/jane-operator/");
  await page.getByLabel("Posted at").fill("2026-06-25");
  await page.getByLabel("Source keyword").fill("founder content");
  await page.getByLabel("Relevance score").fill("87");
  await page.getByLabel("Score reason").fill("Strong audience overlap.");
  await page.getByLabel("Notes").fill("Good approval candidate.");
  const dialog = page.getByRole("dialog", { name: "Add candidate" });
  await dialog.getByRole("button", { name: "Add candidate" }).click();
  await expect(dialog).toBeHidden();
}

async function createDraft(
  page: Page,
  variant: VariantFormInput,
): Promise<void> {
  await page.getByRole("button", { name: "Create draft" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Create draft" }),
  ).toBeVisible();

  await page
    .getByLabel("Angle")
    .fill("Turn the source post into a tactical lesson");
  await page.getByLabel("Notes").fill("Keep the operator tone concrete.");
  await page.locator("#draft-variant-0-hook").fill(variant.hook);
  await page.locator("#draft-variant-0-body").fill(variant.body);
  await page.locator("#draft-variant-0-cta").fill(variant.cta);
  await page.locator("#draft-variant-0-hashtags").fill(variant.hashtags);

  const dialog = page.getByRole("dialog", { name: "Create draft" });
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(dialog).toBeHidden();
}

async function createReview(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create review" }).click();
  await expect(
    page.getByRole("dialog", { name: "Create review" }),
  ).toBeVisible();
  await page.getByLabel("Reviewer notes").fill("Human pass before scheduling.");
  const dialog = page.getByRole("dialog", { name: "Create review" });
  await dialog.getByRole("button", { name: "Create review" }).click();
  await expect(dialog).toBeHidden();
}

async function scheduleApproval(
  page: Page,
  scheduledFor: string,
  timezone: string,
): Promise<void> {
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByLabel("Scheduled for").fill(scheduledFor);
  await page.getByLabel("Timezone label").fill(timezone);
  const dialog = page.getByRole("dialog", { name: "Schedule approval" });
  await dialog.getByRole("button", { name: "Schedule approval" }).click();
  await expect(dialog).toBeHidden();
}
