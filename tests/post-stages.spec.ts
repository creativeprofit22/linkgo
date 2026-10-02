import { expect, test } from "@playwright/test";

import {
  deriveApprovalStage,
  derivePostStageIndex,
} from "../src/features/post-stages/derive-post-stage";
import type {
  PostStageApprovalInput,
  PostStageDraftInput,
} from "../src/features/post-stages/types";

function approval(
  overrides: Partial<PostStageApprovalInput> = {},
): PostStageApprovalInput {
  return {
    id: 10,
    draft_id: 5,
    status: "needs_review",
    created_at: "2026-10-01T09:00:00Z",
    scheduleJob: null,
    publishAttempts: [],
    ...overrides,
  };
}

function draft(
  overrides: Partial<PostStageDraftInput> = {},
): PostStageDraftInput {
  return { id: 5, candidate_post_id: 1, status: "drafting", ...overrides };
}

test.describe("deriveApprovalStage", () => {
  const cases: Array<{
    name: string;
    input: PostStageApprovalInput;
    metrics?: boolean;
    expected: { key: string; state: string; detail: string };
  }> = [
    {
      name: "needs review waits for a human",
      input: approval(),
      expected: {
        key: "waiting",
        state: "needs-you",
        detail: "Waiting for your OK",
      },
    },
    {
      name: "changes requested waits for a human",
      input: approval({ status: "changes_requested" }),
      expected: {
        key: "waiting",
        state: "needs-you",
        detail: "Changes requested",
      },
    },
    {
      name: "approved without a schedule asks for a time",
      input: approval({ status: "approved" }),
      expected: {
        key: "scheduled",
        state: "needs-you",
        detail: "Approved — pick a time",
      },
    },
    {
      name: "approved with a cancelled schedule asks for a time again",
      input: approval({
        status: "approved",
        scheduleJob: { status: "cancelled" },
      }),
      expected: {
        key: "scheduled",
        state: "needs-you",
        detail: "Approved — pick a time",
      },
    },
    {
      name: "scheduled job is scheduled",
      input: approval({
        status: "scheduled",
        scheduleJob: { status: "scheduled" },
      }),
      expected: { key: "scheduled", state: "current", detail: "Scheduled" },
    },
    {
      name: "failed job is a problem",
      input: approval({
        status: "scheduled",
        scheduleJob: { status: "failed" },
      }),
      expected: {
        key: "scheduled",
        state: "problem",
        detail: "Posting failed — check Auto-posting",
      },
    },
    {
      name: "latest failed attempt is a problem",
      input: approval({
        status: "scheduled",
        scheduleJob: { status: "scheduled" },
        publishAttempts: [{ id: 1, status: "failed" }],
      }),
      expected: {
        key: "scheduled",
        state: "problem",
        detail: "Posting failed — check Auto-posting",
      },
    },
    {
      name: "published is posted",
      input: approval({
        status: "published",
        scheduleJob: { status: "completed" },
      }),
      expected: {
        key: "posted",
        state: "current",
        detail: "Posted on LinkedIn",
      },
    },
    {
      name: "a succeeded attempt is posted even after an earlier failure",
      input: approval({
        status: "scheduled",
        publishAttempts: [
          { id: 1, status: "failed" },
          { id: 2, status: "succeeded" },
        ],
      }),
      expected: {
        key: "posted",
        state: "current",
        detail: "Posted on LinkedIn",
      },
    },
    {
      name: "posted with metrics shows results",
      input: approval({ status: "published" }),
      metrics: true,
      expected: {
        key: "results",
        state: "current",
        detail: "Results recorded",
      },
    },
    {
      name: "metrics alone never skip the approval",
      input: approval({ status: "needs_review" }),
      metrics: true,
      expected: {
        key: "waiting",
        state: "needs-you",
        detail: "Waiting for your OK",
      },
    },
    {
      name: "rejected is a problem",
      input: approval({ status: "rejected" }),
      expected: {
        key: "waiting",
        state: "problem",
        detail: "Rejected — this version won't post",
      },
    },
    {
      name: "cancelled is a problem",
      input: approval({ status: "cancelled" }),
      expected: {
        key: "waiting",
        state: "problem",
        detail: "Approval cancelled",
      },
    },
  ];

  for (const { name, input, metrics, expected } of cases) {
    test(name, () => {
      expect(deriveApprovalStage(input, metrics ?? false)).toEqual({
        ...expected,
        draftId: input.draft_id,
        approvalId: input.id,
      });
    });
  }
});

test.describe("derivePostStageIndex", () => {
  test("an idea without a draft is absent, a draft without approval is a draft", () => {
    const index = derivePostStageIndex({
      drafts: [draft({ status: "ready_for_review" })],
      approvals: [],
      approvalIdsWithMetrics: new Set(),
    });
    expect(index.byCandidateId.get(2)).toBeUndefined();
    expect(index.byCandidateId.get(1)).toEqual({
      key: "draft",
      state: "needs-you",
      detail: "Ready to send for approval",
      draftId: 5,
      approvalId: null,
    });
    expect(index.byDraftId.get(5)?.key).toBe("draft");
  });

  test("a rejected approval leaves the draft at the draft stage", () => {
    const index = derivePostStageIndex({
      drafts: [draft()],
      approvals: [approval({ status: "rejected" })],
      approvalIdsWithMetrics: new Set(),
    });
    expect(index.byDraftId.get(5)?.key).toBe("draft");
    expect(index.byApprovalId.get(10)?.state).toBe("problem");
  });

  test("the most advanced live approval wins, ties go to the newest", () => {
    const index = derivePostStageIndex({
      drafts: [draft()],
      approvals: [
        approval({
          id: 10,
          status: "needs_review",
          created_at: "2026-10-03T00:00:00Z",
        }),
        approval({
          id: 11,
          status: "approved",
          created_at: "2026-10-01T00:00:00Z",
        }),
        approval({
          id: 12,
          status: "approved",
          created_at: "2026-10-02T00:00:00Z",
        }),
        approval({
          id: 13,
          status: "cancelled",
          created_at: "2026-10-04T00:00:00Z",
        }),
      ],
      approvalIdsWithMetrics: new Set(),
    });
    expect(index.byDraftId.get(5)?.approvalId).toBe(12);
    expect(index.byCandidateId.get(1)?.approvalId).toBe(12);
  });

  test("an idea with several drafts takes the most advanced one", () => {
    const index = derivePostStageIndex({
      drafts: [draft({ id: 5 }), draft({ id: 6 })],
      approvals: [
        approval({
          id: 20,
          draft_id: 6,
          status: "scheduled",
          scheduleJob: { status: "scheduled" },
        }),
      ],
      approvalIdsWithMetrics: new Set([99]),
    });
    expect(index.byCandidateId.get(1)).toMatchObject({
      key: "scheduled",
      draftId: 6,
      approvalId: 20,
    });
    expect(index.byDraftId.get(5)?.key).toBe("draft");
  });
});
