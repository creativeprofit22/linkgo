/// <reference types="node" />
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

/**
 * The browser fake must enforce the same approval review rules as
 * `src-tauri/src/approval_review.rs`. Rust checks itself against the same
 * file in `approval_review_tests.rs`.
 */
type CreateFacts = {
  campaignStatus: string;
  draftStatus: string;
  selectedVariantIds: number[];
  currentRevisionReady: boolean;
  blockAuditCount: number;
  existingApprovalCount: number;
};

const contract = JSON.parse(
  readFileSync(
    new URL("./fixtures/approval-review-contract.json", import.meta.url),
    "utf8",
  ),
) as {
  createBase: CreateFacts;
  createCases: Array<{
    name: string;
    facts: Partial<CreateFacts>;
    expected: { ok: number } | { error: string };
  }>;
};

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
  await page.goto("/");
});

for (const testCase of contract.createCases) {
  test(`fake approval create gate matches the native contract: ${testCase.name}`, async ({
    page,
  }) => {
    const facts: CreateFacts = { ...contract.createBase, ...testCase.facts };
    const actual = await page.evaluate((input) => {
      const fake = (
        window as unknown as {
          __LINKGO_APPROVAL_CONTRACT__: {
            evaluateApprovalCreate: (
              facts: unknown,
            ) => { ok: number } | { error: string };
          };
        }
      ).__LINKGO_APPROVAL_CONTRACT__;
      return fake.evaluateApprovalCreate(input);
    }, facts);
    expect(actual).toEqual(testCase.expected);
  });
}
