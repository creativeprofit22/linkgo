import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("renders Playbooks tab and five built-in playbooks", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openPlaybooks(page);

  for (const label of [
    "LinkedIn Writer",
    "LinkedIn Humanizer",
    "Content Calendar",
    "LinkedIn Commenter",
    "Campaign Analyst",
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

test("edits custom instructions and persists override row", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openPlaybooks(page);

  const writerCard = getPlaybookCard(page, "LinkedIn Writer");
  await writerCard
    .getByLabel("Your own instructions")
    .fill("Prefer punchy operator lessons with one concrete metric.");
  await writerCard.getByRole("button", { name: "Save guide" }).click();
  await expect(writerCard.getByLabel("Your own instructions")).toHaveValue(
    "Prefer punchy operator lessons with one concrete metric.",
  );

  const overrides = await getPlaybookOverrides(page);
  expect(overrides).toContainEqual(
    expect.objectContaining({
      playbook_key: "linkedin_writer",
      enabled: 1,
      custom_instructions:
        "Prefer punchy operator lessons with one concrete metric.",
    }),
  );
});

test("disables a runtime playbook and marks it disabled", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openPlaybooks(page);

  const writerCard = getPlaybookCard(page, "LinkedIn Writer");
  await writerCard
    .getByRole("switch", { name: "Use with the AI assistant" })
    .click();
  await writerCard.getByRole("button", { name: "Save guide" }).click();

  await expect(writerCard.getByText("Off", { exact: true })).toBeVisible();
  const overrides = await getPlaybookOverrides(page);
  expect(overrides).toContainEqual(
    expect.objectContaining({
      playbook_key: "linkedin_writer",
      enabled: 0,
    }),
  );
});

test("shows commenter as operator guidance only without autonomous posting", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await openPlaybooks(page);

  const commenterCard = getPlaybookCard(page, "LinkedIn Commenter");
  await expect(
    commenterCard.getByText("Tips only", { exact: true }),
  ).toBeVisible();
  await expect(commenterCard.getByText("Tips for you only")).toBeVisible();
  await expect(commenterCard.getByText("No assistant actions")).toBeVisible();
  await expect(
    commenterCard.getByRole("button", { name: /post|comment|publish/i }),
  ).toHaveCount(0);
});

test("native override command rejects invalid playbook overrides", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    upsertOverride(page, {
      playbookKey: "bad_playbook",
      enabled: true,
      customInstructions: "Allowed size",
    }),
  ).rejects.toThrow("Unknown playbook");

  await expect(
    upsertOverride(page, {
      playbookKey: "linkedin_writer",
      enabled: true,
      customInstructions: "x".repeat(2001),
    }),
  ).rejects.toThrow("Custom instructions must be at most 2000 characters");

  expect(await getPlaybookOverrides(page)).toEqual([]);
});

async function openPlaybooks(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Brand voice/ }).click();
  await expect(
    page.getByRole("heading", { name: "Brand voice", exact: true }),
  ).toBeVisible();
}

function getPlaybookCard(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
}

async function upsertOverride(
  page: Page,
  input: { playbookKey: string; enabled: boolean; customInstructions: string },
): Promise<unknown> {
  return page.evaluate((commandInput) => {
    const internals = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__;
    if (internals === undefined) throw new Error("Tauri mocks unavailable");
    return internals.invoke("linkgo_playbook_override_upsert", {
      input: commandInput,
    });
  }, input);
}

async function getPlaybookOverrides(page: Page): Promise<
  Array<{
    playbook_key: string;
    enabled: number;
    custom_instructions: string;
  }>
> {
  return page.evaluate(() => {
    const getRows = (
      window as unknown as {
        __LINKGO_SQL_PLAYBOOK_OVERRIDES__?: () => Array<{
          playbook_key: string;
          enabled: number;
          custom_instructions: string;
        }>;
      }
    ).__LINKGO_SQL_PLAYBOOK_OVERRIDES__;
    if (getRows === undefined)
      throw new Error("Playbook overrides unavailable");
    return getRows();
  });
}
