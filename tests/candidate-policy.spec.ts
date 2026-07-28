import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("shows the conservative default and fixed intake disclosures", async ({
  page,
}) => {
  await openQueueWithCampaign(page);

  const card = page.getByTestId("candidate-policy-card");
  await expect(card).toContainText("30-day maximum");
  await expect(card).toContainText("HTTPS LinkedIn only");
  await expect(card).toContainText("Absolute timestamp required");
  await expect(card).toContainText("Prior successful contacts blocked");
  await expect(card).toContainText("0 banned topics");
  await expect(card).toContainText(
    "Manual Add candidate entry is an attended override",
  );

  const dialog = await openPolicyDialog(page);
  await expect(dialog).toContainText(
    "Values more than five minutes in the future are blocked.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("validates, saves, and reloads normalized policy configuration", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await enableReloadPersistence(page);
  const dialog = await openPolicyDialog(page);
  const age = dialog.getByLabel("Maximum post age in days");
  const topics = dialog.getByLabel("Banned topics");

  await age.fill("0");
  await topics.fill("AI\n  ai  ");
  await dialog.getByRole("button", { name: "Save policy" }).click();
  await expect(dialog).toContainText("Maximum post age must be at least 1 day");
  await expect(dialog).toContainText("Duplicate banned topic: ai");
  await expect(topics).toHaveValue("AI\n  ai  ");

  await age.fill("30");
  await topics.fill(
    Array.from({ length: 26 }, (_, index) => `topic ${index}`).join("\n"),
  );
  await dialog.getByRole("button", { name: "Save policy" }).click();
  await expect(dialog).toContainText("Use no more than 25 banned topics");

  await topics.fill("x".repeat(81));
  await dialog.getByRole("button", { name: "Save policy" }).click();
  await expect(dialog).toContainText(
    "Banned topics must be 80 characters or fewer",
  );

  await age.fill("45");
  await topics.fill("Artificial   Intelligence\nPolitical campaigning");
  await dialog.getByRole("button", { name: "Save policy" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "45-day maximum",
  );
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "2 banned topics",
  );

  const policyState = await page.evaluate(() => {
    const state = window as unknown as {
      __LINKGO_SQL_CANDIDATE_POLICIES__?: () => Array<Record<string, unknown>>;
      __LINKGO_SQL_CANDIDATE_POLICY_TOPICS__?: () => Array<
        Record<string, unknown>
      >;
    };
    return {
      policies: state.__LINKGO_SQL_CANDIDATE_POLICIES__?.() ?? [],
      topics: state.__LINKGO_SQL_CANDIDATE_POLICY_TOPICS__?.() ?? [],
    };
  });
  expect(policyState.policies[0]).toMatchObject({ max_post_age_days: 45 });
  expect(policyState.topics.map((topic) => topic.normalized_topic)).toEqual([
    "artificial intelligence",
    "political campaigning",
  ]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openQueue(page);
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "45-day maximum",
  );
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "2 banned topics",
  );
});

test("returns the saved policy without a fallible post-commit reload", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  const dialog = await openPolicyDialog(page);
  await dialog.getByLabel("Maximum post age in days").fill("75");
  await dialog.getByLabel("Banned topics").fill("post-commit safety");
  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_FAIL_CANDIDATE_POLICY_POST_COMMIT_LOAD__?: boolean;
      }
    ).__LINKGO_FAIL_CANDIDATE_POLICY_POST_COMMIT_LOAD__ = true;
  });

  await dialog.getByRole("button", { name: "Save policy" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "75-day maximum",
  );
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "1 banned topic",
  );
});

test("preserves dialog values after storage failure and blocks archived mutation", async ({
  page,
}) => {
  await openQueueWithCampaign(page);
  await enableReloadPersistence(page);
  const dialog = await openPolicyDialog(page);
  await dialog.getByLabel("Maximum post age in days").fill("60");
  await dialog.getByLabel("Banned topics").fill("regulated claims");
  await page.evaluate(() => {
    (
      window as unknown as { __LINKGO_FAIL_CANDIDATE_POLICY_SAVE__?: boolean }
    ).__LINKGO_FAIL_CANDIDATE_POLICY_SAVE__ = true;
  });
  await dialog.getByRole("button", { name: "Save policy" }).click();
  await expect(dialog).toContainText("Injected candidate policy save failure");
  await expect(dialog.getByLabel("Maximum post age in days")).toHaveValue("60");
  await expect(dialog.getByLabel("Banned topics")).toHaveValue(
    "regulated claims",
  );

  await page.evaluate(() => {
    const state = window as unknown as {
      __LINKGO_SQL_SET_CAMPAIGN_STATUS__?: (id: number, status: string) => void;
    };
    state.__LINKGO_SQL_SET_CAMPAIGN_STATUS__?.(1, "archived");
  });
  await dialog.getByRole("button", { name: "Save policy" }).click();
  await expect(dialog).toContainText("Campaign is archived");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await openQueue(page);
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "This archived campaign is read-only",
  );
  await expect(
    page.getByRole("button", { name: "Edit policy" }),
  ).toBeDisabled();
});

test("campaign switching cannot display a stale candidate policy", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Policy Campaign A");
  await createCampaign(page, "Policy Campaign B");
  await openQueue(page);
  const selector = page.getByRole("combobox");

  await selector.selectOption({ label: "Policy Campaign A" });
  await savePolicy(page, "15", "campaign a only");
  await selector.selectOption({ label: "Policy Campaign B" });
  await savePolicy(page, "90", "campaign b only");

  await page.evaluate(() => {
    const state = window as unknown as {
      __LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__?: (id: number) => void;
    };
    state.__LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__?.(1);
  });
  await selector.selectOption({ label: "Policy Campaign A" });
  await page.waitForFunction(() => {
    const state = window as unknown as {
      __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__?: (id: number) => number;
    };
    return (state.__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__?.(1) ?? 0) > 0;
  });
  await selector.selectOption({ label: "Policy Campaign B" });
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "90-day maximum",
  );

  await page.evaluate(() => {
    const state = window as unknown as {
      __LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__?: (id: number) => void;
    };
    state.__LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__?.(1);
  });
  await page.waitForFunction(() => {
    const state = window as unknown as {
      __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__?: (id: number) => number;
    };
    return (state.__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__?.(1) ?? 0) === 0;
  });
  await expect(selector).toHaveValue("2");
  await expect(page.getByTestId("candidate-policy-card")).toContainText(
    "90-day maximum",
  );
  await expect(page.getByTestId("candidate-policy-card")).not.toContainText(
    "15-day maximum",
  );
});

test("policy dialog completes by keyboard, returns focus, and reflows", async ({
  page,
}, testInfo: TestInfo) => {
  await openQueueWithCampaign(page);
  const trigger = page.getByRole("button", { name: "Edit policy" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Edit candidate intake policy",
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const captureDirectory = process.env.LINKGO_CAPTURE_CANDIDATE_POLICY;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path:
      captureDirectory === "true"
        ? ".gg/screenshots/candidate-policy-desktop.png"
        : testInfo.outputPath("candidate-policy-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await trigger.scrollIntoViewIfNeeded();
  await page.keyboard.press("Enter");
  await expectReflow(page);
  await page.screenshot({
    path:
      captureDirectory === "true"
        ? ".gg/screenshots/candidate-policy-narrow.png"
        : testInfo.outputPath("candidate-policy-narrow.png"),
    fullPage: true,
  });

  await dialog.getByLabel("Maximum post age in days").fill("35");
  await dialog
    .getByLabel("Banned topics")
    .fill("a very long but valid policy phrase for narrow reflow testing");
  await dialog.getByRole("button", { name: "Save policy" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectReflow(page);

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).not.toHaveCSS("transition-property", "none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(trigger).toHaveCSS("transition-property", "none");

  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  const card = page.getByTestId("candidate-policy-card");
  await expect(card).toBeVisible();
  await expect(card).toHaveCSS("border-top-style", "solid");
  await expect(card).not.toHaveCSS("border-top-width", "0px");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveCSS("border-top-style", "solid");
  await expect(trigger).not.toHaveCSS("border-top-width", "0px");

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("border-top-style", "solid");
  await expect(dialog).not.toHaveCSS("border-top-width", "0px");
  const forcedColorsControls = [
    dialog.getByLabel("Maximum post age in days"),
    dialog.getByLabel("Banned topics"),
    dialog.getByRole("button", { name: "Cancel" }),
    dialog.getByRole("button", { name: "Save policy" }),
    dialog.getByRole("button", { name: "Close" }),
  ];
  for (const control of forcedColorsControls) {
    await expect(control).toBeVisible();
    await expect(control).toHaveCSS("border-top-style", "solid");
    await expect(control).not.toHaveCSS("border-top-width", "0px");
    await expect(control).toHaveCSS("transition-property", "none");
    const colors = await control.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        foreground: style.color,
        background: style.backgroundColor,
      };
    });
    expect(colors.foreground).not.toBe(colors.background);
  }

  await dialog.getByLabel("Maximum post age in days").fill("36");
  await expect(dialog.getByLabel("Maximum post age in days")).toHaveValue("36");
  await page.screenshot({
    path:
      captureDirectory === "true"
        ? ".gg/screenshots/candidate-policy-forced-colors.png"
        : testInfo.outputPath("candidate-policy-forced-colors.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

async function savePolicy(
  page: Page,
  age: string,
  topics: string,
): Promise<void> {
  const dialog = await openPolicyDialog(page);
  await dialog.getByLabel("Maximum post age in days").fill(age);
  await dialog.getByLabel("Banned topics").fill(topics);
  await dialog.getByRole("button", { name: "Save policy" }).click();
  await expect(dialog).toBeHidden();
}

async function openPolicyDialog(page: Page) {
  await page.getByRole("button", { name: "Edit policy" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit candidate intake policy",
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function enableReloadPersistence(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as unknown as {
      __LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__?: () => void;
    };
    state.__LINKGO_SQL_ENABLE_RELOAD_PERSISTENCE__?.();
  });
}

async function expectReflow(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
}

async function openQueueWithCampaign(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Candidate policy campaign");
  await openQueue(page);
}

async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();
  await expect(page.getByTestId("candidate-policy-card")).toBeVisible();
}

async function createCampaign(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}
