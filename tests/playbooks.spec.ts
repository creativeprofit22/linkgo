import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";
import { openSection } from "./helpers/navigation";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("renders Playbooks tab and five built-in playbooks", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
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
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await openPlaybooks(page);

  const writerCard = getPlaybookCard(page, "LinkedIn Writer");
  await writerCard
    .getByLabel("Your own instructions")
    .fill("Prefer punchy operator lessons with one concrete metric.");
  await writerCard.getByRole("button", { name: "Save brand voice" }).click();
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
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await openPlaybooks(page);

  const writerCard = getPlaybookCard(page, "LinkedIn Writer");
  await writerCard
    .getByRole("switch", { name: "Use with the AI assistant" })
    .click();
  await writerCard.getByRole("button", { name: "Save brand voice" }).click();

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
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
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

test("focus link scrolls to and focuses a guidance-only guide heading", async ({
  page,
}) => {
  await page.goto("/#/playbooks?focus=linkedin_commenter", {
    waitUntil: "domcontentloaded",
  });

  const heading = page.getByRole("heading", { name: "LinkedIn Commenter" });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
});

test("native override command rejects invalid playbook overrides", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });

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

test("lessons in Brand voice switch on and off what new drafts use", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await createLesson(page, "winner", "Open with a question");
  await createLesson(page, "avoid", "Long intros");

  await openPlaybooks(page);
  const lessons = page.getByRole("region", {
    name: "Lessons from your results",
  });
  await expect(lessons.getByTestId("lesson-group")).toContainText(
    "Founder-led growth",
  );
  await expect(lessons.getByTestId("lesson-row")).toHaveCount(2);

  // Both on: the avoid lesson is labelled so it never reads as "used".
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await generateDraftVariants(page);
  const both = page.locator(
    `[data-testid="draft-generation-request"][data-request-id="1"]`,
  );
  await expect(both.getByTestId("draft-generation-lessons")).toHaveText(
    // Newest first: "Long intros" was saved last.
    "Used: Avoid: Long intros · Open with a question",
  );
  await both.getByRole("button", { name: "Dismiss" }).click();
  await expect(both).toBeHidden();

  await openPlaybooks(page);
  const avoidSwitch = lessons.getByRole("switch", {
    name: "Use in drafts: Long intros",
  });
  await expect(avoidSwitch).toBeChecked();
  await avoidSwitch.click();
  await expect(avoidSwitch).not.toBeChecked();

  await openDrafts(page);
  await generateDraftVariants(page);
  const first = page.locator(
    `[data-testid="draft-generation-request"][data-request-id="2"]`,
  );
  await expect(first.getByTestId("draft-generation-lessons")).toHaveText(
    "Used: Open with a question",
  );
  await first.getByRole("button", { name: "Dismiss" }).click();
  await expect(first).toBeHidden();

  await openPlaybooks(page);
  const questionSwitch = lessons.getByRole("switch", {
    name: "Use in drafts: Open with a question",
  });
  await questionSwitch.click();
  await expect(questionSwitch).not.toBeChecked();

  await openDrafts(page);
  await generateDraftVariants(page);
  await expect(
    page
      .locator(`[data-testid="draft-generation-request"][data-request-id="3"]`)
      .getByTestId("draft-generation-lessons"),
  ).toHaveText("No lessons used");
});

test("Brand voice explains lessons when none are saved", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
  await openPlaybooks(page);
  await expect(
    page.getByRole("region", { name: "Lessons from your results" }),
  ).toContainText("No lessons yet.");
});

async function createCampaign(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name").fill("Founder-led growth");
  await dialog
    .getByLabel("Product")
    .fill("A local-first LinkedIn operations cockpit");
  await dialog.getByLabel("Audience").fill("Solo founders and operators");
  await dialog.getByLabel("Voice").fill("Concrete, concise, practical");
  await dialog.getByLabel("Tone").fill("Helpful operator");
  await dialog.getByLabel("Manual keywords").fill("founder content");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

/** Saves a lesson for campaign 1 through the native command. */
async function createLesson(
  page: Page,
  signal: "winner" | "avoid",
  summary: string,
): Promise<void> {
  await page.evaluate(
    (input) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (cmd: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (internals === undefined) throw new Error("Tauri mocks unavailable");
      return internals.invoke("linkgo_metrics_create_campaign_memory", {
        input: { ...input, campaignId: 1, evidence: "", confidence: 60 },
      });
    },
    { signal, summary },
  );
}

async function openQueue(page: Page): Promise<void> {
  await openSection(page, "Create", "Ideas");
  await expect(
    page.getByRole("heading", { name: "Ideas", exact: true }),
  ).toBeVisible();
}

async function openDrafts(page: Page): Promise<void> {
  await openSection(page, "Create", "Drafts");
  await expect(
    page.getByRole("heading", { name: "Drafts", exact: true }),
  ).toBeVisible();
}

async function addCandidate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add idea" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add idea" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/example-activity-123/");
  await dialog
    .getByLabel("Post text")
    .fill("This founder post has a sharp ICP signal.");
  await dialog.getByLabel("Author name").fill("Jane Operator");
  await dialog.getByLabel("Match score").fill("87");
  await dialog.getByRole("button", { name: "Add idea" }).click();
  await expect(dialog).toBeHidden();
}

async function generateDraftVariants(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Write with AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Write versions with AI" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Write versions" }).click();
  await expect(dialog).toBeHidden();
}

async function openPlaybooks(page: Page): Promise<void> {
  await openSection(page, "Settings", "Brand voice");
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
