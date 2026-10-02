import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";
import {
  recordPublishAttemptSchema,
  setApprovalStatusSchema,
} from "../src/features/approvals/schemas";

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

for (const state of ["running", "failed"] as const) {
  test(`latest quality ${state} overrides an older pass in display and approval eligibility`, async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await createReadyDraft(page, cleanVariant());
    await makeDraftApprovalEligible(page);
    await page.evaluate(async (state) => {
      const api = (
        window as unknown as {
          __LINKGO_DRAFTS_TEST_API__: typeof import("../src/features/drafts/data");
        }
      ).__LINKGO_DRAFTS_TEST_API__;
      const variant = (await api.listDrafts())[0].variants[0];
      const invoke = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (
              command: string,
              args: unknown,
            ) => Promise<{ qualityRunId: number; attemptId: number }>;
          };
        }
      ).__TAURI_INTERNALS__.invoke;
      const claim = await invoke("linkgo_draft_quality_claim", {
        input: {
          draftVariantId: variant.id,
          providerKey: "dry_run",
          modelName: "dry-run-local",
        },
      });
      if (state === "failed")
        await invoke("linkgo_draft_quality_fail", {
          input: {
            qualityRunId: claim.qualityRunId,
            draftVariantId: variant.id,
            attemptId: claim.attemptId,
            errorMessage: "Interrupted latest quality run",
          },
        });
    }, state);
    await openApprovals(page);
    const blocked = await checkApprovalReadiness(page);
    expect(blocked.eligibleDraftIds).toEqual([]);
    expect(blocked.created).toBe(false);
    await openDrafts(page);
    const panel = page.getByRole("region", {
      name: "Quality score",
      exact: true,
    });
    await expect(
      panel.getByText(state === "running" ? "In progress" : "Didn't finish", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(panel.getByText("Passed", { exact: true })).toBeHidden();

    // A new valid check for the same revision restores readiness; history remains.
    if (state === "running")
      await page.evaluate(async () => {
        const api = (
          window as unknown as {
            __LINKGO_DRAFTS_TEST_API__: typeof import("../src/features/drafts/data");
          }
        ).__LINKGO_DRAFTS_TEST_API__;
        const variant = (await api.listDrafts())[0].variants[0];
        const invoke = (
          window as unknown as {
            __TAURI_INTERNALS__: {
              invoke: (command: string, args: unknown) => Promise<unknown>;
            };
          }
        ).__TAURI_INTERNALS__.invoke;
        await invoke("linkgo_draft_quality_fail", {
          input: {
            qualityRunId: variant.qualityScorecard!.run.id,
            draftVariantId: variant.id,
            attemptId: variant.qualityScorecard!.attempts.at(-1)!.id,
            errorMessage: "Interrupted",
          },
        });
      });
    await makeDraftApprovalEligible(page);
    await openApprovals(page);
    const restored = await checkApprovalReadiness(page);
    expect(restored.eligibleDraftIds).toEqual([1]);
    expect(restored.created).toBe(true);
    await openDrafts(page);
    await expect(panel.getByText("Passed", { exact: true })).toBeVisible();
  });
}

test("approval status schema requires the displayed revision for approval", () => {
  for (const contentRevision of [undefined, null, 0, -1, 1.5, "1"]) {
    expect(
      setApprovalStatusSchema.safeParse({
        id: 1,
        status: "approved",
        contentRevision,
      }).success,
    ).toBe(false);
  }
  expect(
    setApprovalStatusSchema.safeParse({
      id: 1,
      status: "approved",
      contentRevision: 2,
    }).success,
  ).toBe(true);
  expect(
    setApprovalStatusSchema.safeParse({ id: 1, status: "changes_requested" })
      .success,
  ).toBe(true);
});

test("approval status schema rejects statuses owned by scheduling and publishing", () => {
  for (const status of ["scheduled", "published"]) {
    expect(
      setApprovalStatusSchema.safeParse({ id: 1, status, contentRevision: 1 })
        .success,
    ).toBe(false);
  }
  for (const status of ["needs_review", "rejected", "cancelled"]) {
    expect(setApprovalStatusSchema.safeParse({ id: 1, status }).success).toBe(
      true,
    );
  }
});

for (const initiallyApproved of [false, true]) {
  test(`content edits revoke ${initiallyApproved ? "approved" : "pending"} review readiness across reload`, async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await createReadyDraft(page, cleanVariant());
    await makeDraftApprovalEligible(page);
    await openApprovals(page);
    await createReview(page);
    if (initiallyApproved)
      await page.getByRole("button", { name: "Approve", exact: true }).click();

    await page.evaluate(async () => {
      const api = (
        window as unknown as {
          __LINKGO_DRAFTS_TEST_API__: typeof import("../src/features/drafts/data");
        }
      ).__LINKGO_DRAFTS_TEST_API__;
      await api.updateDraftVariant({
        id: 1,
        body: "We tested 18 interviews and changed our conclusion.",
      });
      (
        window as unknown as {
          __LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__: () => void;
        }
      ).__LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await openApprovals(page);
    await expect(getBadge(page, "Changes requested")).toBeVisible();
    await expect(getBadge(page, "Approved")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText(/This post changed after it was reviewed/),
    ).toBeVisible();

    await openDrafts(page);
    const auditPanel = page.getByRole("region", { name: /AI review/ });
    await auditPanel.getByRole("button", { name: "Review with AI" }).click();
    await expect(auditPanel.getByText("Done", { exact: true })).toBeVisible();
    await openApprovals(page);
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeDisabled();
    await makeDraftApprovalEligible(page);
    await openDrafts(page);
    await openApprovals(page);
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(getBadge(page, "Approved")).toBeVisible();
  });
}

test("normalized no-op edits preserve the reviewed revision and approval", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const revisions = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        __LINKGO_DRAFTS_TEST_API__: typeof import("../src/features/drafts/data");
      }
    ).__LINKGO_DRAFTS_TEST_API__;
    const before = (await api.listDrafts())[0].variants[0];
    await api.updateDraftVariant({ id: before.id, body: `  ${before.body}  ` });
    const after = (await api.listDrafts())[0].variants[0];
    return [before.content_revision, after.content_revision];
  });
  expect(revisions[0]).toBe(revisions[1]);
  await openDrafts(page);
  await openApprovals(page);
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(page.getByText(/This content is not approved/)).toBeHidden();
});

test("creates, previews, approves, schedules, and publishes an approval", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, reservedCharacterVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeHidden();
  await expect(getBadge(page, "Waiting for approval")).toBeVisible();
  await expect(
    page.getByText(reservedCharacterVariant().hook).first(),
  ).toBeVisible();
  await expect(page.getByText("Version 1")).toBeVisible();
  await expect(page.getByText("\\@founder")).toBeVisible();
  await expect(page.getByText("\\#Growth")).toBeVisible();
  await expect(page.getByText("\\*useful\\*")).toBeVisible();
  await expect(page.getByText("\\_notes\\_")).toBeVisible();

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await countSchedulingInvokes(page);
  await countLinkedInPublishInvokes(page);

  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByLabel("Date and time").fill("2026-06-25T14:30");
  await page.getByLabel("Time zone").fill("local");
  await page.getByRole("button", { name: "Schedule post" }).click();
  await expect(getBadge(page, "Scheduled").first()).toBeVisible();
  await expect(page.getByText("2026-06-25T14:30 · local")).toBeVisible();
  expect(await getSchedulingInvokeCount(page)).toBe(1);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);

  await page.getByRole("button", { name: "Mark as posted" }).click();
  await page
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/manual-success/");
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(getBadge(page, "Posted")).toBeVisible();
  await expect(getBadge(page, "Went live")).toBeVisible();
  await expect(
    page.getByText("https://www.linkedin.com/posts/manual-success/"),
  ).toBeVisible();
});

test("publishes an approved approval through mocked LinkedIn OAuth action", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, reservedCharacterVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Post to LinkedIn" }).click();

  const dialog = page.getByRole("dialog", { name: "Post to LinkedIn now" });
  await expect(
    dialog.getByText(
      "This posts to LinkedIn from your connected account. Linkgo never posts without your OK.",
    ),
  ).toBeVisible();
  await expect(dialog.getByText("\\@founder")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeDisabled();

  await dialog.getByLabel("Type “Post now” to confirm").fill("Post now");
  await dialog.getByRole("button", { name: "Post to LinkedIn" }).click();

  await expect(getBadge(page, "Posted")).toBeVisible();
  await expect(getBadge(page, "Went live")).toBeVisible();
  await expect(
    page.getByText("LinkedIn reference: urn:li:ugcPost:test-1"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
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
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Post to LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Post to LinkedIn now" });
  await dialog.getByLabel("Type “Post now” to confirm").fill("Post now");
  await dialog.getByRole("button", { name: "Post to LinkedIn" }).click();

  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(getBadge(page, "Didn't post")).toBeVisible();
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "LinkedIn API rejected the post." }),
  ).toBeVisible();
  const counts = await getStateCounts(page);
  expect(counts.publishAttempts).toBe(1);
  expect(counts.errorQueueItems).toBe(1);
});

test("unreadable LinkedIn publish result shows outcome unknown and needs reconciliation", async ({
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
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Post to LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Post to LinkedIn now" });
  await dialog.getByLabel("Type “Post now” to confirm").fill("Post now");
  await dialog.getByRole("button", { name: "Post to LinkedIn" }).click();

  await expect(
    dialog
      .getByRole("alert")
      .filter({ hasText: "We couldn't confirm it posted" }),
  ).toBeVisible();
  const counts = await getStateCounts(page);
  expect(counts.publishAttempts).toBe(0);
  const recordInvokes = await page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>)
        .__LINKGO_APPROVAL_RECORD_PUBLISH_INVOKES__ ?? 0,
  );
  expect(recordInvokes).toBe(0);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeDisabled();
  await expect(
    page.getByText("We couldn't confirm it posted. Check it in Safety."),
  ).toBeVisible();
});

for (const [status, label] of [
  ["outcome_unknown", "We couldn't confirm it posted. Check it in Safety."],
  ["in_flight", "Posting…"],
] as const) {
  test(`open ${status} publish execution locks the approval publish action`, async ({
    page,
  }) => {
    await page.addInitScript((executionStatus) => {
      const now = new Date().toISOString();
      (
        window as unknown as Record<string, unknown>
      ).__LINKGO_PUBLISH_EXECUTIONS__ = [
        {
          id: 41,
          kind: "post",
          subjectId: 1,
          campaignId: 1,
          campaignName: "Launch",
          scheduleJobId: null,
          caller: "manual",
          status: executionStatus,
          fence: 1,
          remoteOutcome: "",
          remoteStatusCode: null,
          errorMessage: "",
          reservedAt: now,
          sentAt: now,
          updatedAt: now,
        },
      ];
    }, status);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await createReadyDraft(page, cleanVariant());
    await makeDraftApprovalEligible(page);
    await openApprovals(page);
    await createReview(page);
    await page.getByRole("button", { name: "Approve", exact: true }).click();

    await expect(
      page.getByRole("button", { name: "Post to LinkedIn" }),
    ).toBeDisabled();
    await expect(page.getByText(label)).toBeVisible();
  });
}

test("global kill switch hides LinkedIn OAuth publish action", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeVisible();

  await openSafety(page);
  await page
    .getByLabel("Reason for pausing")
    .fill("Pause LinkedIn publishing during review.");
  await page.getByRole("button", { name: "Pause everything" }).click();
  await expect(
    page.getByText("On — everything is paused", { exact: true }),
  ).toBeVisible();

  await openApprovals(page);
  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeHidden();
});

test("LinkedIn OAuth publish rechecks approval state before submitting", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await countLinkedInPublishInvokes(page);
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Post to LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Post to LinkedIn now" });
  await dialog.getByLabel("Type “Post now” to confirm").fill("Post now");

  await setApprovalStatusThroughMockSql(page, 1, "changes_requested");
  await dialog.getByRole("button", { name: "Post to LinkedIn" }).click();

  await expect(page.getByText("Linkgo stopped this post")).toBeVisible();
  await expect(
    page.getByText(
      "Only approved or scheduled approvals can publish via LinkedIn",
    ),
  ).toBeVisible();
  expect(await getPublishAttemptCount(page)).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);
});

test("LinkedIn OAuth publish is blocked when a newer AI audit revokes readiness", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await countLinkedInPublishInvokes(page);
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeVisible();

  // A new AI audit on the same revision leaves the approval `approved`.
  await setApprovalAiAuditState(page, "running");

  const result = await publishViaTestApi(page, {
    approvalId: 1,
    commentary: "Unready approval should be blocked.",
    idempotencyKey: "approval:1:linkedin:unready",
  });
  expect(result).toEqual({
    ok: false,
    message:
      "Approval is stale or not ready. Reload and run current AI audit and quality checks.",
  });
  expect(await getPublishAttemptCount(page)).toBe(0);
  expect(await getLinkedInPublishInvokeCount(page)).toBe(0);

  await openSafety(page);
  await openApprovals(page);
  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Schedule", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Mark as posted" }),
  ).toBeHidden();
  await expect(
    page.getByText("This version isn't ready for approval yet."),
  ).toBeVisible();

  // A real failed outcome is still recordable and revokes the approval.
  await page.getByRole("button", { name: "Mark as not posted" }).click();
  await page
    .getByLabel("What went wrong")
    .fill("Posted manually, then failed.");
  await page.getByRole("button", { name: "Save result" }).click();
  await expect.poll(() => getPublishAttemptCount(page)).toBe(1);
  await expect(
    getBadge(page, "Didn't post").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as not posted" }),
  ).toBeHidden();
});

test("LinkedIn OAuth publish preflight blocks duplicate successes and stale schedules", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await countLinkedInPublishInvokes(page);
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
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

  await page.getByRole("button", { name: "Mark as posted" }).click();
  await page
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/first-success/");
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(getBadge(page, "Posted")).toBeVisible();

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
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Post to LinkedIn" }).click();
  const dialog = page.getByRole("dialog", { name: "Post to LinkedIn now" });
  await dialog.getByLabel("Type “Post now” to confirm").fill("Post now");

  await enableKillSwitchThroughMockSql(
    page,
    "Emergency stop before LinkedIn submission.",
  );
  await dialog.getByRole("button", { name: "Post to LinkedIn" }).click();

  await expect(page.getByText("Linkgo stopped this post")).toBeVisible();
  await expect(
    page.getByText(
      "Everything is paused: Emergency stop before LinkedIn submission.",
    ),
  ).toBeVisible();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(getBadge(page, "Went live")).toBeHidden();
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
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Mark as posted" }).click();

  const dialog = page.getByRole("dialog", { name: "Record posting result" });
  const recordButton = dialog.getByRole("button", { name: "Save result" });
  await expect(recordButton).toBeDisabled();
  await expect(
    dialog.getByText(
      "LinkedIn URL or platform post ID is required for success",
    ),
  ).toBeVisible();

  await dialog.getByLabel("LinkedIn post reference").fill("manual-success-id");
  await expect(recordButton).toBeEnabled();

  await dialog.getByLabel("LinkedIn post reference").fill("");
  await expect(recordButton).toBeDisabled();

  await dialog
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/manual-success/");
  await expect(recordButton).toBeEnabled();
});

test("publish attempt schema trims evidence and rejects non-LinkedIn URLs", () => {
  const parsed = recordPublishAttemptSchema.parse({
    approvalId: 1,
    status: "succeeded",
    externalPostUrl: "  https://linkedin.com/feed/update/1/  ",
    platformPostId: "   ",
  });
  expect(parsed.externalPostUrl).toBe("https://linkedin.com/feed/update/1/");
  expect(parsed.platformPostId).toBe("");
  for (const input of [
    { status: "succeeded", externalPostUrl: "https://example.com/x" },
    { status: "succeeded", externalPostUrl: "  ", platformPostId: "\t" },
    { status: "succeeded", platformPostId: "p".repeat(201) },
    { status: "failed", errorMessage: "   " },
    { status: "failed", errorMessage: "e".repeat(1001) },
  ]) {
    expect(
      recordPublishAttemptSchema.safeParse({ approvalId: 1, ...input }).success,
      JSON.stringify(input),
    ).toBe(false);
  }
});

test("mark published rejects a non-LinkedIn URL and records nothing", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Mark as posted" }).click();

  const dialog = page.getByRole("dialog", { name: "Record posting result" });
  const recordButton = dialog.getByRole("button", { name: "Save result" });
  await dialog.getByLabel("LinkedIn post URL").fill("https://example.com/x");
  await expect(
    dialog.getByText(
      "LinkedIn post URL must start with https://www.linkedin.com/",
    ),
  ).toBeVisible();
  await expect(recordButton).toBeDisabled();
  expect(await getPublishAttemptCount(page)).toBe(0);

  // The native command enforces the same rule when the form is bypassed.
  const message = await page.evaluate(async () => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string, args: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__.invoke;
    try {
      await invoke("linkgo_approval_record_publish_attempt", {
        input: {
          approvalId: 1,
          status: "succeeded",
          externalPostUrl: "https://example.com/x",
        },
      });
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  expect(message).toBe(
    "LinkedIn post URL must start with https://www.linkedin.com/",
  );
  expect(await getPublishAttemptCount(page)).toBe(0);
  await expect(getBadge(page, "Approved")).toBeVisible();
});

test("failed publish attempts require a failure reason", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Mark as not posted" }).click();

  const dialog = page.getByRole("dialog", { name: "Record posting result" });
  const recordButton = dialog.getByRole("button", { name: "Save result" });
  await expect(recordButton).toBeDisabled();
  await expect(
    dialog.getByText("Failure reason is required for failed attempts"),
  ).toBeVisible();

  await dialog.getByLabel("What went wrong").fill("Local browser was offline.");
  await expect(recordButton).toBeEnabled();
});

test("published approvals reject duplicate successful publish attempts", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Mark as posted" }).click();
  await page
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/first-success/");
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(getBadge(page, "Posted")).toBeVisible();

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
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
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
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await scheduleApproval(page, "2026-06-25T14:30", "local");
  await expect(page.getByText("2026-06-25T14:30 · local")).toBeVisible();

  await page.getByRole("button", { name: "Mark as not posted" }).click();
  await page.getByLabel("What went wrong").fill("Local browser was offline.");
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(
    getBadge(page, "Didn't post").filter({ visible: true }).first(),
  ).toBeVisible();
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
    if (state === "passing") await makeDraftApprovalEligible(page);

    const result = await checkApprovalReadiness(page);

    expect(result.eligibleDraftIds).toEqual(eligible ? [1] : []);
    expect(result.created).toBe(eligible);
    expect(result.error).toBe(
      eligible
        ? ""
        : "Selected variant requires both a completed current-revision AI audit with six canonical non-blocking findings and a passed quality score of at least 70",
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
    page.getByRole("button", { name: "Send for approval" }),
  ).toBeDisabled();
  await expect(
    page.getByText("No drafts are ready to send for approval"),
  ).toBeVisible();
});

test("flags capped approval and eligible-draft lists with the uncapped total", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  // The mock reports these uncapped totals instead of seeding 500+ rows.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__LINKGO_APPROVAL_ELIGIBLE_TOTAL__ = 205;
    w.__LINKGO_APPROVAL_LIST_TOTAL__ = 503;
  });
  await openApprovals(page);

  await page.getByRole("button", { name: "Send for approval" }).click();
  const dialog = page.getByRole("dialog", { name: "Send for approval" });
  await expect(dialog.getByTestId("list-truncation-notice")).toHaveText(
    /Showing the first 1 of 205 ready drafts/u,
  );
  await page.getByLabel("Reviewer notes").fill("Human pass.");
  await dialog.getByRole("button", { name: "Send for approval" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByTestId("list-truncation-notice")).toHaveText(
    /Showing the first 1 of 503 approvals/u,
  );
  await expect(
    page.getByText("Waiting for approval (shown)", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Posted (shown)", { exact: true })).toBeVisible();
});

test("request changes moves the linked draft back to needs revision", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(getBadge(page, "Changes requested")).toBeVisible();
  await openDrafts(page);

  await expect(getBadge(page, "Needs changes")).toBeVisible();
});

test("archived campaign approvals hide mutation controls with restore guidance", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(getBadge(page, "Approved")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Schedule", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as posted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark as not posted" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeVisible();

  await archiveSelectedCampaign(page);
  await openApprovals(page);

  await expect(
    page.getByText(
      "This campaign is archived, so its approvals can't change. Restore the campaign first.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Request changes" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Schedule", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Mark as posted" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Mark as not posted" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Post to LinkedIn" }),
  ).toBeHidden();
});

test.describe("approval campaign selection ownership", () => {
  test("a slow campaign A load cannot overwrite campaign B after reselection", async ({
    page,
  }) => {
    const { first, second } = await setupTwoCampaigns(page);
    const selector = getCampaignSelector(page);

    await selectApprovalCampaign(page, second);
    await delayCampaign(page, first);
    await selector.selectOption(String(first));
    await expect.poll(() => getDelayedCount(page, first)).toBeGreaterThan(0);
    await selectApprovalCampaign(page, second);
    await releaseCampaign(page, first);
    await settleCampaignLoads(page, first);

    await expect(selector).toHaveValue(String(second));
    await expect(page.getByText("No approvals yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toHaveCount(0);
  });

  test("a failed campaign load shows an alert without stale actions and Retry recovers", async ({
    page,
  }) => {
    const { first, second } = await setupTwoCampaigns(page);

    await selectApprovalCampaign(page, second);
    await page.evaluate(() => {
      (
        window as unknown as { __LINKGO_FAIL_APPROVAL_LIST__?: boolean }
      ).__LINKGO_FAIL_APPROVAL_LIST__ = true;
    });
    await getCampaignSelector(page).selectOption(String(first));

    const alert = page.getByRole("alert").filter({
      hasText: "Injected approval list failure",
    });
    await expect(alert).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send for approval" }),
    ).toBeDisabled();

    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(alert).toBeHidden();
    await expect(getCampaignSelector(page)).toHaveValue(String(first));
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeVisible();
  });

  test("a mutation refresh finishing after a selection change keeps the new campaign", async ({
    page,
  }) => {
    const { first, second } = await setupTwoCampaigns(page);

    await selectApprovalCampaign(page, first);
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeVisible();
    await delayCampaign(page, first);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => getDelayedCount(page, first)).toBeGreaterThan(0);

    await selectApprovalCampaign(page, second);
    await releaseCampaign(page, first);
    await settleCampaignLoads(page, first);

    await expect(getCampaignSelector(page)).toHaveValue(String(second));
    await expect(page.getByText("No approvals yet")).toBeVisible();
    await expect(getBadge(page, "Approved")).toHaveCount(0);

    await selectApprovalCampaign(page, first);
    await expect(getBadge(page, "Approved")).toBeVisible();
  });

  test("a committed mutation whose refresh fails shows an alert instead of stale cards", async ({
    page,
  }) => {
    const { first } = await setupTwoCampaigns(page);

    await selectApprovalCampaign(page, first);
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      (
        window as unknown as { __LINKGO_FAIL_APPROVAL_LIST__?: boolean }
      ).__LINKGO_FAIL_APPROVAL_LIST__ = true;
    });
    await page.getByRole("button", { name: "Approve", exact: true }).click();

    const alert = page.getByRole("alert").filter({
      hasText: "Injected approval list failure",
    });
    await expect(alert).toBeVisible();
    await expect(
      page.getByText("Saved, but we couldn't refresh your approvals"),
    ).toBeVisible();
    await expect(
      page.getByText("We couldn't update this approval"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toHaveCount(0);

    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(alert).toBeHidden();
    await expect(getCampaignSelector(page)).toHaveValue(String(first));
    await expect(getBadge(page, "Approved")).toBeVisible();
  });

  test("each campaign selection issues exactly one approval list request", async ({
    page,
  }) => {
    const { first, second } = await setupTwoCampaigns(page);

    await selectApprovalCampaign(page, second);
    await flushRenders(page);
    await resetApprovalListCalls(page);
    await selectApprovalCampaign(page, first);
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toBeVisible();
    await flushRenders(page);

    expect(await getApprovalListCalls(page)).toEqual([first]);
  });
});

async function setupTwoCampaigns(
  page: Page,
): Promise<{ first: number; second: number }> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createReadyDraft(page, cleanVariant());
  await makeDraftApprovalEligible(page);
  await openApprovals(page);
  await createReview(page);
  await openCampaigns(page);
  await createCampaign(page, "Second campaign");
  await openApprovals(page);
  const ids = await getCampaignSelector(page).evaluate((element) => {
    const select = element as HTMLSelectElement;
    return Object.fromEntries(
      Array.from(select.options, (option) => [
        option.textContent ?? "",
        Number(option.value),
      ]),
    );
  });
  const first = ids["Founder-led growth"];
  const second = ids["Second campaign"];
  if (first === undefined || second === undefined) {
    throw new Error("Expected both campaigns in the approvals selector");
  }
  return { first, second };
}

function getCampaignSelector(page: Page): Locator {
  return page.getByRole("combobox", { name: "Selected campaign" });
}

/** Selects a campaign and waits until its approval list has rendered. */
async function selectApprovalCampaign(
  page: Page,
  campaignId: number,
): Promise<void> {
  const selector = getCampaignSelector(page);
  if ((await selector.inputValue()) !== String(campaignId)) {
    await selector.selectOption(String(campaignId));
  }
  await expect(selector).toHaveValue(String(campaignId));
  await expect(page.getByText("Loading approvals…")).toHaveCount(0);
}

type CampaignGateWindow = {
  __LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__: (campaignId: number) => void;
  __LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__: (campaignId: number) => void;
  __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__: (campaignId: number) => number;
  __LINKGO_APPROVAL_LIST_CALLS__?: unknown[];
};

async function delayCampaign(page: Page, campaignId: number): Promise<void> {
  await page.evaluate((id) => {
    (
      window as unknown as CampaignGateWindow
    ).__LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__(id);
  }, campaignId);
}

async function releaseCampaign(page: Page, campaignId: number): Promise<void> {
  await page.evaluate((id) => {
    (
      window as unknown as CampaignGateWindow
    ).__LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__(id);
  }, campaignId);
}

async function getDelayedCount(
  page: Page,
  campaignId: number,
): Promise<number> {
  return page.evaluate(
    (id) =>
      (
        window as unknown as CampaignGateWindow
      ).__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__(id),
    campaignId,
  );
}

/** Waits for released gated loads to resolve and React to commit them. */
async function settleCampaignLoads(
  page: Page,
  campaignId: number,
): Promise<void> {
  await expect.poll(() => getDelayedCount(page, campaignId)).toBe(0);
  await flushRenders(page);
}

async function flushRenders(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }, 100);
      }),
  );
}

async function resetApprovalListCalls(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as CampaignGateWindow).__LINKGO_APPROVAL_LIST_CALLS__ =
      [];
  });
}

async function getApprovalListCalls(page: Page): Promise<unknown[]> {
  return page.evaluate(
    () =>
      (window as unknown as CampaignGateWindow)
        .__LINKGO_APPROVAL_LIST_CALLS__ ?? [],
  );
}

interface VariantFormInput {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

function getBadge(page: Page, label: string): Locator {
  return page.locator("span").filter({
    hasText: new RegExp(`^${label.replaceAll("'", "\\u0027")}$`, "u"),
  });
}

async function countSchedulingInvokes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as unknown as {
      __TAURI_INTERNALS__?: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
      __LINKGO_SCHEDULING_INVOKES__?: number;
    };
    const internals = target.__TAURI_INTERNALS__;
    if (internals === undefined) return;
    const originalInvoke = internals.invoke.bind(internals);
    target.__LINKGO_SCHEDULING_INVOKES__ = 0;
    internals.invoke = (cmd: string, args?: unknown) => {
      if (cmd === "linkgo_approval_schedule") {
        target.__LINKGO_SCHEDULING_INVOKES__ =
          (target.__LINKGO_SCHEDULING_INVOKES__ ?? 0) + 1;
      }
      return originalInvoke(cmd, args);
    };
  });
}

async function getSchedulingInvokeCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __LINKGO_SCHEDULING_INVOKES__?: number })
        .__LINKGO_SCHEDULING_INVOKES__ ?? 0,
  );
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

      await invoke("__linkgo_test_sql|execute", {
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

    await invoke("__linkgo_test_sql|execute", {
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
    await invoke("__linkgo_test_sql|execute", {
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

async function createCampaign(
  page: Page,
  name = "Founder-led growth",
): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "New campaign" }),
  ).toBeVisible();

  await page.getByLabel("Name").fill(name);
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
  await page.getByRole("button", { name: "Add idea" }).first().click();
  await expect(page.getByRole("dialog", { name: "Add idea" })).toBeVisible();

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
  await page.getByLabel("Match score").fill("87");
  await page.getByLabel("Score reason").fill("Strong audience overlap.");
  await page.getByLabel("Notes").fill("Good approval candidate.");
  const dialog = page.getByRole("dialog", { name: "Add idea" });
  await dialog.getByRole("button", { name: "Add idea" }).click();
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
  await page.getByRole("button", { name: "Send for approval" }).click();
  await expect(
    page.getByRole("dialog", { name: "Send for approval" }),
  ).toBeVisible();
  await page.getByLabel("Reviewer notes").fill("Human pass before scheduling.");
  const dialog = page.getByRole("dialog", { name: "Send for approval" });
  await dialog.getByRole("button", { name: "Send for approval" }).click();
  await expect(dialog).toBeHidden();
}

async function scheduleApproval(
  page: Page,
  scheduledFor: string,
  timezone: string,
): Promise<void> {
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByLabel("Date and time").fill(scheduledFor);
  await page.getByLabel("Time zone").fill(timezone);
  const dialog = page.getByRole("dialog", { name: "Schedule post" });
  await dialog.getByRole("button", { name: "Schedule post" }).click();
  await expect(dialog).toBeHidden();
}
