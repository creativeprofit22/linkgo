import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("creates a draft with two variants and shows audit output", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await createDraft(page, [cleanVariant(), warningVariant()]);

  await expect(
    page.getByRole("heading", { name: "Jane Operator" }),
  ).toBeVisible();
  await expect(page.getByText("Variant 1")).toBeVisible();
  await expect(page.getByText("Variant 2")).toBeVisible();
  await expect(
    page.getByText("This variant has draft text to review.").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Warnings", { exact: true }).first(),
  ).toBeVisible();
});

test("generates dry-run variants then saves them as an audited draft", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await generateDraftVariants(page);

  await expect(page.getByText("Generated request #1")).toBeVisible();
  await expect(page.getByText("Drafted 3 local variants.")).toBeVisible();
  const inputSummary = await page.evaluate(() => {
    const getAgentRuns = (
      window as unknown as {
        __LINKGO_SQL_AGENT_RUNS__: () => Array<{ input_summary: string }>;
      }
    ).__LINKGO_SQL_AGENT_RUNS__;
    return getAgentRuns()[0]?.input_summary ?? "";
  });
  expect(inputSummary).toContain("Campaign: Founder-led growth.");
  expect(inputSummary).toContain("Target author: Jane Operator.");
  expect(inputSummary).toContain(
    'Target post excerpt: "This founder post has a sharp ICP signal.".',
  );
  expect(inputSummary).toContain("Source keyword: founder content.");
  expect(inputSummary).toContain("Score reason: Strong audience overlap.");
  expect(inputSummary).toContain("Candidate notes: Good comment opportunity.");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Generated drafts pending" }),
  ).toBeHidden();
  await expect(page.getByText("Generated request #1")).toBeHidden();

  await expect(
    page.getByRole("heading", { name: "Jane Operator" }),
  ).toBeVisible();
  await expect(
    page.getByText("This variant has draft text to review.").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate variants" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Create draft" }),
  ).toBeDisabled();
});

test("dismisses generated variants from the pending work area", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await generateDraftVariants(page);
  await expect(page.getByText("Generated request #1")).toBeVisible();

  await page.getByRole("button", { name: "Dismiss" }).click();

  await expect(
    page.getByRole("heading", { name: "Generated drafts pending" }),
  ).toBeHidden();
  await expect(page.getByText("Generated request #1")).toBeHidden();
});

test("persists a failed generation request and dismisses it", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await page.getByRole("button", { name: "Generate variants" }).click();
  const dialog = page.getByRole("dialog", { name: "Generate draft variants" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Provider").selectOption({ label: "OpenAI" });
  await dialog
    .getByLabel("Angle")
    .fill("Turn this into a concrete operator lesson");
  await dialog.getByRole("button", { name: "Generate variants" }).click();

  await expect(page.getByText("Draft variants were not generated")).toBeVisible();
  await expect(
    page
      .locator("p")
      .filter({ hasText: "Drafter did not return draft_post variants" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Generated request #1")).toBeVisible();
  await expect(getBadge(page, "failed")).toBeVisible();
  await expect(
    page
      .locator("p")
      .filter({ hasText: "Drafter did not return draft_post variants" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Dismiss failed request" }).click();

  await expect(
    page.getByRole("heading", { name: "Generated drafts pending" }),
  ).toBeHidden();
  await expect(page.getByText("Generated request #1")).toBeHidden();
});

test("creating a draft removes the drafted candidate from draft flows", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await createDraft(page, [cleanVariant()]);
  await expect(
    page.getByRole("button", { name: "Create draft" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Generate variants" }),
  ).toBeDisabled();
  await openQueue(page);

  await expect(
    page.getByText("Drafted", { exact: true }).first(),
  ).toBeVisible();
});

test("audit blocks external links and too many hashtags", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await createDraft(page, [blockedVariant()]);

  await expect(
    page.getByText("Blocked", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Remove external links from the hook, body, and CTA before review.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Use five or fewer hashtags.")).toBeVisible();
});

test("blocked variant cannot be selected", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page, [blockedVariant()]);

  await page.getByRole("button", { name: "Select for review" }).click();

  await expect(
    page.getByText("Draft variant status was not changed"),
  ).toBeVisible();
  await expect(
    page.getByText("Blocked variants cannot be selected"),
  ).toBeVisible();
  await expect(getBadge(page, "Ready for review")).toBeHidden();
});

test("clean variant can be selected and draft status becomes ready", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page, [cleanVariant()]);

  await page.getByRole("button", { name: "Select for review" }).click();

  await expect(getBadge(page, "Ready for review")).toBeVisible();
  await expect(getBadge(page, "Selected")).toBeVisible();
});

test("editing a variant re-runs audit and clears an external link block", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page, [linkBlockedVariant()]);

  await expect(
    page.getByText(
      "Remove external links from the hook, body, and CTA before review.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit variant" }).click();
  await page
    .locator('[id^="variant-"][id$="-body"]')
    .fill("We tested 12 replies and kept the useful lesson in the post body.");
  await page.getByRole("button", { name: "Save and re-audit" }).click();

  await expect(page.getByText("No external link was found")).toBeVisible();
  await expect(
    page.getByText(
      "Remove external links from the hook, body, and CTA before review.",
    ),
  ).toBeHidden();
});

test("rejected candidates are not available for draft flows", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(
    page.getByText("Rejected", { exact: true }).first(),
  ).toBeVisible();

  await openDrafts(page);

  await expect(
    page.getByRole("button", { name: "Create draft" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Generate variants" }),
  ).toBeDisabled();
});

test("archived campaign candidates are not available for draft flows", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openCampaigns(page);
  await archiveCampaign(page, "Founder-led growth");
  await createCampaign(page, "Active funnel");
  await openDrafts(page);

  await page
    .getByRole("combobox")
    .selectOption({ label: "Founder-led growth (archived)" });

  await expect(
    page.getByRole("button", { name: "Create draft" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Generate variants" }),
  ).toBeDisabled();
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

function cleanVariant(): VariantFormInput {
  return {
    hook: "We turned 12 customer interviews into one simple sales motion",
    body: "The useful part was not the script. It was the pattern behind the replies.",
    cta: "Save this before your next outbound sprint.",
    hashtags: "#LinkedInGrowth #Sales",
  };
}

function warningVariant(): VariantFormInput {
  return {
    hook: "Quick update",
    body: "This post needs a stronger angle before review.",
    cta: "What would you add?",
    hashtags: "#Growth",
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

function linkBlockedVariant(): VariantFormInput {
  return {
    hook: "We found 12 useful lessons from this customer post",
    body: "Read the full teardown at https://example.com before replying.",
    cta: "Comment with your take.",
    hashtags: "#Growth",
  };
}

async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();
}

async function openCampaigns(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
}

async function openDrafts(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Drafts/ }).click();
  await expect(
    page.getByRole("heading", { name: "Drafts", exact: true }),
  ).toBeVisible();
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
  await page
    .getByLabel("Audience")
    .fill("Solo founders and technical operators");
  await page.getByLabel("Voice").fill("Concrete, concise, practical");
  await page.getByLabel("Tone").fill("Helpful operator");
  await page
    .getByLabel("Manual keywords")
    .fill("LinkedIn growth, founder content, outbound");
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function archiveCampaign(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: `Open ${name} actions` }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
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
  await page.getByLabel("Notes").fill("Good comment opportunity.");
  const dialog = page.getByRole("dialog", { name: "Add candidate" });
  await dialog.getByRole("button", { name: "Add candidate" }).click();
  await expect(dialog).toBeHidden();
}

async function generateDraftVariants(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Generate variants" }).click();
  const dialog = page.getByRole("dialog", { name: "Generate draft variants" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Angle")
    .fill("Turn this into a concrete operator lesson");
  await dialog.getByRole("button", { name: "Generate variants" }).click();
  await expect(dialog).toBeHidden();
}

async function createDraft(
  page: Page,
  variants: VariantFormInput[],
): Promise<void> {
  await page.getByRole("button", { name: "Create draft" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Create draft" }),
  ).toBeVisible();

  await page
    .getByLabel("Angle")
    .fill("Turn the source post into a tactical lesson");
  await page.getByLabel("Notes").fill("Keep the operator tone concrete.");

  for (const [index, variant] of variants.entries()) {
    if (index > 0)
      await page.getByRole("button", { name: "Add variant" }).click();
    await page.locator(`#draft-variant-${index}-hook`).fill(variant.hook);
    await page.locator(`#draft-variant-${index}-body`).fill(variant.body);
    await page.locator(`#draft-variant-${index}-cta`).fill(variant.cta);
    await page
      .locator(`#draft-variant-${index}-hashtags`)
      .fill(variant.hashtags);
  }

  const dialog = page.getByRole("dialog", { name: "Create draft" });
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(dialog).toBeHidden();
}
