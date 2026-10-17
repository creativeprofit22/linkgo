import { expect, test } from "@playwright/test";
import {
  CAMPAIGN_DAILY_COMMENT_LIMIT_MAX,
  CAMPAIGN_DAILY_POST_LIMIT_MAX,
  createCampaignSchema,
} from "../src/features/campaigns/schemas";
import {
  callFakeGate,
  type GateExpectation,
  readContract,
  withOverrides,
} from "./helpers/contract-fixtures";
import { setupTauriMocks } from "./helpers/tauri-mocks";

/**
 * The browser fake must enforce the same publishing, scheduling, cap and
 * comment rules as the native app. Each table below is also run against the
 * real Rust functions (publishing_tests.rs, approval_scheduling_tests.rs,
 * campaigns_tests.rs, comment_threads_tests.rs).
 */

type Case<F, E> = { name: string; facts: Partial<F>; expected: E };

type PublishingTable = {
  openExecutionBlocking: Array<{
    name: string;
    open: { kind: string; subject: number; caller: string; status: string };
    attempt: { kind: string; subject: number; caller: string };
    blocked: boolean;
  }>;
  postPublishBase: Record<string, unknown>;
  postPublishCases: Array<Case<Record<string, unknown>, GateExpectation>>;
  commentPublishBase: Record<string, unknown>;
  commentPublishCases: Array<Case<Record<string, unknown>, GateExpectation>>;
  commentPublishCapCounting: {
    cases: Array<{
      name: string;
      attempts: string[];
      executions: string[];
      blocked: boolean;
    }>;
  };
};
const publishing = readContract("publishing-contract.json") as PublishingTable;

type SchedulingTable = {
  countedJobStatuses: string[];
  eligibilityBase: Record<string, unknown>;
  eligibilityCases: Array<Case<Record<string, unknown>, GateExpectation>>;
  limitBase: Record<string, unknown>;
  limitCases: Array<
    Case<Record<string, unknown>, { decision: string; message: string }>
  >;
  windowKeyCases: Array<{ scheduledFor: string; windowKey: string }>;
};
const scheduling = readContract("scheduling-contract.json") as SchedulingTable;

type Cap = { default: number; min: number; max: number };
type LimitsTable = {
  dailyPostLimit: Cap;
  dailyCommentLimit: Cap;
  validationCases: Array<{
    field: "dailyPostLimit" | "dailyCommentLimit";
    value: number;
    expected: GateExpectation;
  }>;
};
const limits = readContract("campaign-limits-contract.json") as LimitsTable;

type CommentsTable = {
  terminalStatuses: string[];
  threadStatusBase: Record<string, unknown>;
  threadStatusCases: Array<Case<Record<string, unknown>, GateExpectation>>;
  variantStatusCases: Array<{
    name: string;
    threadStatus: string;
    next: string;
    variantBlocked: boolean;
    expected: GateExpectation;
  }>;
  assertBase: Record<string, unknown>;
  assertCases: Array<Case<Record<string, unknown>, Record<string, string>>>;
  limitSummaryCases: Array<{
    windowKey: string;
    count: number;
    limit: number;
    allowed: boolean;
    summary: string;
  }>;
};
const comments = readContract("comment-review-contract.json") as CommentsTable;

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
  await page.goto("/");
});

test("fake publish locks match the native open-execution contract", async ({
  page,
}) => {
  for (const testCase of publishing.openExecutionBlocking) {
    const blocked = await callFakeGate<boolean>(
      page,
      "isOpenExecutionBlocking",
      [testCase.open, testCase.attempt],
    );
    expect(blocked, testCase.name).toBe(testCase.blocked);
  }
});

test("fake post publish gate matches the native contract", async ({ page }) => {
  for (const testCase of publishing.postPublishCases) {
    const actual = await callFakeGate<GateExpectation>(
      page,
      "evaluatePostPublish",
      [withOverrides(publishing.postPublishBase, testCase.facts)],
    );
    expect(actual, testCase.name).toEqual(testCase.expected);
  }
});

test("fake comment publish gate matches the native contract", async ({
  page,
}) => {
  for (const testCase of publishing.commentPublishCases) {
    const actual = await callFakeGate<GateExpectation>(
      page,
      "evaluateCommentPublish",
      [withOverrides(publishing.commentPublishBase, testCase.facts)],
    );
    expect(actual, testCase.name).toEqual(testCase.expected);
  }
});

test("fake comment cap counting matches the native contract", async ({
  page,
}) => {
  // Cap of one: blocked when any succeeded attempt or open execution counts.
  for (const testCase of publishing.commentPublishCapCounting.cases) {
    let counted = testCase.attempts.filter(
      (status) => status === "succeeded",
    ).length;
    for (const status of testCase.executions) {
      if (await callFakeGate<boolean>(page, "countsTowardCommentCap", [status]))
        counted += 1;
    }
    const actual = await callFakeGate<GateExpectation>(
      page,
      "evaluateCommentPublish",
      [
        withOverrides(publishing.commentPublishBase, {
          dailyCount: counted,
          dailyCommentLimit: 1,
        }),
      ],
    );
    expect("error" in actual, testCase.name).toBe(testCase.blocked);
  }
});

test("fake schedule eligibility matches the native contract", async ({
  page,
}) => {
  for (const testCase of scheduling.eligibilityCases) {
    const actual = await callFakeGate<GateExpectation>(
      page,
      "evaluateScheduleEligibility",
      [withOverrides(scheduling.eligibilityBase, testCase.facts)],
    );
    expect(actual, testCase.name).toEqual(testCase.expected);
  }
});

test("fake schedule cap and kill switch match the native contract", async ({
  page,
}) => {
  for (const testCase of scheduling.limitCases) {
    const actual = await callFakeGate<{ decision: string; message: string }>(
      page,
      "evaluateScheduleLimit",
      [withOverrides(scheduling.limitBase, testCase.facts)],
    );
    expect(actual, testCase.name).toEqual(testCase.expected);
  }
  for (const status of ["scheduled", "completed", "cancelled", "failed"]) {
    expect(
      await callFakeGate<boolean>(page, "isCountedJobStatus", [status]),
      status,
    ).toBe(scheduling.countedJobStatuses.includes(status));
  }
});

test("fake schedule day buckets match SQLite date()", async ({ page }) => {
  for (const testCase of scheduling.windowKeyCases) {
    expect(
      await callFakeGate<string>(page, "sqliteWindowKey", [
        testCase.scheduledFor,
      ]),
      testCase.scheduledFor,
    ).toBe(testCase.windowKey);
  }
});

test("renderer schema caps match the native contract", () => {
  expect(CAMPAIGN_DAILY_POST_LIMIT_MAX).toBe(limits.dailyPostLimit.max);
  expect(CAMPAIGN_DAILY_COMMENT_LIMIT_MAX).toBe(limits.dailyCommentLimit.max);
  const defaults = createCampaignSchema.parse({ name: "Defaults" });
  expect(defaults.dailyPostLimit).toBe(limits.dailyPostLimit.default);
  expect(defaults.dailyCommentLimit).toBe(limits.dailyCommentLimit.default);
  for (const testCase of limits.validationCases) {
    const parsed = createCampaignSchema.safeParse({
      name: "Caps",
      [testCase.field]: testCase.value,
    });
    expect(parsed.success, `${testCase.field}=${testCase.value}`).toBe(
      "ok" in testCase.expected,
    );
  }
});

test("fake cap validation matches the native contract", async ({ page }) => {
  for (const testCase of limits.validationCases) {
    const actual = await callFakeGate<GateExpectation>(
      page,
      "validateDailyCap",
      [testCase.field, testCase.value],
    );
    expect(actual, `${testCase.field}=${testCase.value}`).toEqual(
      testCase.expected,
    );
  }
});

test("fake comment thread moves match the native contract", async ({
  page,
}) => {
  for (const testCase of comments.threadStatusCases) {
    const actual = await callFakeGate<GateExpectation>(
      page,
      "evaluateThreadStatus",
      [withOverrides(comments.threadStatusBase, testCase.facts)],
    );
    expect(actual, testCase.name).toEqual(testCase.expected);
  }
  for (const status of ["posted", "rejected", "cancelled", "approved"]) {
    expect(
      await callFakeGate<boolean>(page, "isTerminalCommentStatus", [status]),
      status,
    ).toBe(comments.terminalStatuses.includes(status));
  }
});

test("fake comment variant changes match the native contract", async ({
  page,
}) => {
  for (const testCase of comments.variantStatusCases) {
    const actual = await callFakeGate<GateExpectation>(
      page,
      "evaluateVariantStatus",
      [
        {
          threadStatus: testCase.threadStatus,
          next: testCase.next,
          variantBlocked: testCase.variantBlocked,
        },
      ],
    );
    expect(actual, testCase.name).toEqual(testCase.expected);
  }
});

test("fake comment pre-publish check matches the native contract", async ({
  page,
}) => {
  for (const testCase of comments.assertCases) {
    const actual = await callFakeGate<Record<string, string>>(
      page,
      "evaluateCommentAssert",
      [withOverrides(comments.assertBase, testCase.facts)],
    );
    expect(actual, testCase.name).toEqual(testCase.expected);
  }
  for (const testCase of comments.limitSummaryCases) {
    const actual = await callFakeGate<{ allowed: boolean; summary: string }>(
      page,
      "commentLimitSummary",
      [testCase.windowKey, testCase.count, testCase.limit],
    );
    expect(actual).toEqual({
      allowed: testCase.allowed,
      summary: testCase.summary,
    });
  }
});
