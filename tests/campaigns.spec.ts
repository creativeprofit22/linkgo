import { expect, test, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("new campaign dialog opens and creates a campaign", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await createCampaign(page);

  const campaignInsertCount = await page.evaluate(() => {
    const calls =
      (window as unknown as {
        __LINKGO_SQL_EXECUTE_CALLS__?: Array<{ query: string }>;
      }).__LINKGO_SQL_EXECUTE_CALLS__ ?? [];
    return calls.filter((call) => call.query.includes("INSERT INTO campaigns"))
      .length;
  });

  expect(campaignInsertCount).toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: "Founder-led growth" }),
  ).toBeVisible();
  await expect(
    page.getByText("A local-first LinkedIn operations cockpit"),
  ).toBeVisible();
  await expect(
    page.getByText("Solo founders and technical operators"),
  ).toBeVisible();
  await expect(page.getByText("Autopilot intent on")).toBeVisible();
  await expect(
    page.getByText("LinkedIn growth", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2 posts/day · 7 comments/day")).toBeVisible();
});

test("campaign card edit action updates campaign context", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);

  await page
    .getByRole("button", { name: "Open Founder-led growth actions" })
    .click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit Founder-led growth" }),
  ).toBeVisible();

  await page.getByLabel("Product").fill("An AI assisted LinkedIn command center");
  await page.getByLabel("Audience").fill("B2B founders and revenue operators");
  await page
    .getByLabel("Manual keywords")
    .fill("AI LinkedIn, revenue workflows");
  await page.getByLabel("Daily post limit").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();

  const campaignUpdateCount = await page.evaluate(() => {
    const calls =
      (window as unknown as {
        __LINKGO_SQL_EXECUTE_CALLS__?: Array<{ query: string }>;
      }).__LINKGO_SQL_EXECUTE_CALLS__ ?? [];
    return calls.filter(
      (call) =>
        call.query.includes("UPDATE campaigns SET") &&
        !call.query.includes("UPDATE campaigns SET status"),
    ).length;
  });

  expect(campaignUpdateCount).toBeGreaterThan(0);
  await expect(
    page.getByText("An AI assisted LinkedIn command center"),
  ).toBeVisible();
  await expect(
    page.getByText("B2B founders and revenue operators"),
  ).toBeVisible();
  await expect(page.getByText("AI LinkedIn", { exact: true })).toBeVisible();
  await expect(page.getByText("3 posts/day · 7 comments/day")).toBeVisible();
});

test("campaign card status actions activate pause archive and restore", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);

  await expectCampaignStatus(page, "Draft");

  await page.getByRole("button", { name: "Activate" }).click();
  await expectCampaignStatus(page, "Active");

  await page.getByRole("button", { name: "Pause" }).click();
  await expectCampaignStatus(page, "Paused");

  await page.getByRole("button", { name: "Archive" }).click();
  await expectCampaignStatus(page, "Archived");

  await page
    .getByRole("button", { name: "Open Founder-led growth actions" })
    .click();
  await page.getByRole("menuitem", { name: "Restore to draft" }).click();
  await expectCampaignStatus(page, "Draft");

  const statusUpdates = await page.evaluate(() => {
    const calls =
      (window as unknown as {
        __LINKGO_SQL_EXECUTE_CALLS__?: Array<{ query: string; values: unknown[] }>;
      }).__LINKGO_SQL_EXECUTE_CALLS__ ?? [];
    return calls
      .filter((call) => call.query.includes("UPDATE campaigns SET status"))
      .map((call) => call.values[0]);
  });

  expect(statusUpdates).toEqual(["active", "paused", "archived", "draft"]);
});

async function expectCampaignStatus(
  page: Page,
  status: "Draft" | "Active" | "Paused" | "Archived",
): Promise<void> {
  await expect(page.getByText(status, { exact: true })).toBeVisible();
}

async function createCampaign(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await expect(page.getByRole("dialog", { name: "New campaign" })).toBeVisible();

  await page.getByLabel("Name").fill("Founder-led growth");
  await page.getByLabel("Product").fill("A local-first LinkedIn operations cockpit");
  await page.getByLabel("Audience").fill("Solo founders and technical operators");
  await page.getByLabel("Voice").fill("Concrete, concise, practical");
  await page.getByLabel("Tone").fill("Helpful operator");
  await page
    .getByLabel("Manual keywords")
    .fill("LinkedIn growth, founder content, outbound");
  await page.getByLabel("Daily post limit").fill("2");
  await page.getByLabel("Daily comment limit").fill("7");
  await page.getByLabel("Autopilot intent").click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}
