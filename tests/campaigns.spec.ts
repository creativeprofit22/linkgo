import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createCampaignSchema,
  updateCampaignSchema,
} from "../src/features/campaigns/schemas";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test("campaign update schema keeps omitted fields omitted", () => {
  expect(updateCampaignSchema.parse({ id: 1, status: "paused" })).toEqual({
    id: 1,
    status: "paused",
  });
  expect(updateCampaignSchema.parse({ id: 1, name: " x " })).toEqual({
    id: 1,
    name: "x",
  });
});

test("campaign create schema still fills defaults", () => {
  expect(createCampaignSchema.parse({ name: "x" })).toEqual({
    name: "x",
    product: "",
    audience: "",
    voice: "",
    tone: "",
    autoPilot: false,
    dailyPostLimit: 1,
    dailyCommentLimit: 5,
    keywords: [],
  });
});

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("new campaign dialog opens and creates a campaign", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await createCampaign(page);

  const campaignInsertCount = await page.evaluate(() => {
    const calls =
      (
        window as unknown as {
          __LINKGO_NATIVE_CAMPAIGN_CALLS__?: Array<{ cmd: string }>;
        }
      ).__LINKGO_NATIVE_CAMPAIGN_CALLS__ ?? [];
    return calls.filter((call) => call.cmd === "linkgo_campaign_create").length;
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
  await expect(page.getByText("Local planner eligible")).toBeVisible();
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

  await page
    .getByLabel("Product")
    .fill("An AI assisted LinkedIn command center");
  await page.getByLabel("Audience").fill("B2B founders and revenue operators");
  await page
    .getByLabel("Manual keywords")
    .fill("AI LinkedIn, revenue workflows");
  await page.getByLabel("Daily post limit").fill("3");
  await page.getByRole("button", { name: "Save changes" }).click();

  const campaignUpdateCount = await page.evaluate(() => {
    const calls =
      (
        window as unknown as {
          __LINKGO_NATIVE_CAMPAIGN_CALLS__?: Array<{ cmd: string }>;
        }
      ).__LINKGO_NATIVE_CAMPAIGN_CALLS__ ?? [];
    return calls.filter((call) => call.cmd === "linkgo_campaign_update").length;
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

test("creating a campaign with an existing name shows the duplicate-name error", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);

  const dialog = await submitNewCampaign(page, "Founder-led growth");

  await expect(page.getByText("Campaign was not created")).toBeVisible();
  await expect(
    page.getByText("A campaign with this name already exists"),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Founder-led growth" }),
  ).toHaveCount(1);
});

test("renaming a campaign to an existing name shows the duplicate-name error", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await createCampaign(page, "Second campaign");

  await page
    .getByRole("button", { name: "Open Second campaign actions" })
    .click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Second campaign" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Name").fill("Founder-led growth");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Campaign was not updated")).toBeVisible();
  await expect(
    page.getByText("A campaign with this name already exists"),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
});

test("campaign text inputs cap length at the schema limits", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });

  await expect(dialog.getByLabel("Name")).toHaveAttribute("maxlength", "120");
  await expect(dialog.getByLabel("Product")).toHaveAttribute(
    "maxlength",
    "500",
  );
  await expect(dialog.getByLabel("Tone")).toHaveAttribute("maxlength", "240");
});

test("too many keywords shows a readable error without calling native", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });

  await dialog.getByLabel("Name").fill("Keyword overload");
  const keywords = Array.from({ length: 31 }, (_, index) => `kw${index}`);
  await dialog.getByLabel("Manual keywords").fill(keywords.join(", "));
  await dialog.getByRole("button", { name: "Create campaign" }).click();

  const alert = dialog.getByRole("alert");
  await expect(alert).toHaveText(
    "Up to 30 keywords, each at most 80 characters.",
  );
  await expect(page.getByText('"code"')).toHaveCount(0);
  await expect(page.getByText("too_big")).toHaveCount(0);
  await expect(dialog).toBeVisible();

  const createCount = await page.evaluate(() => {
    const calls =
      (
        window as unknown as {
          __LINKGO_NATIVE_CAMPAIGN_CALLS__?: Array<{ cmd: string }>;
        }
      ).__LINKGO_NATIVE_CAMPAIGN_CALLS__ ?? [];
    return calls.filter((call) => call.cmd === "linkgo_campaign_create").length;
  });
  expect(createCount).toBe(0);
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
      (
        window as unknown as {
          __LINKGO_NATIVE_CAMPAIGN_CALLS__?: Array<{
            cmd: string;
            input: { status?: string };
          }>;
        }
      ).__LINKGO_NATIVE_CAMPAIGN_CALLS__ ?? [];
    return calls
      .filter((call) => call.cmd === "linkgo_campaign_status_set")
      .map((call) => call.input.status);
  });

  expect(statusUpdates).toEqual(["active", "paused", "archived", "draft"]);
});

async function expectCampaignStatus(
  page: Page,
  status: "Draft" | "Active" | "Paused" | "Archived",
): Promise<void> {
  await expect(page.getByText(status, { exact: true })).toBeVisible();
}

async function createCampaign(
  page: Page,
  name = "Founder-led growth",
): Promise<void> {
  const dialog = await submitNewCampaign(page, name);
  await expect(dialog).toBeHidden();
}

async function submitNewCampaign(page: Page, name: string): Promise<Locator> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "New campaign" }),
  ).toBeVisible();

  await page.getByLabel("Name").fill(name);
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
    .fill("LinkedIn growth, founder content, outbound");
  await page.getByLabel("Daily post limit").fill("2");
  await page.getByLabel("Daily comment limit").fill("7");
  await page.getByLabel("Local autopilot planner").click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  return dialog;
}
