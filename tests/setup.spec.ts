import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test.setTimeout(90_000);

function checklist(page: Page): Locator {
  return page.getByRole("region", {
    name: /Get started with Linkgo|You're all set/,
  });
}

function launcher(page: Page): Locator {
  return page.getByRole("link", { name: /^Get started \d of 4/ });
}

function step(page: Page, key: string): Locator {
  return page.getByTestId(`setup-step-${key}`);
}

async function connectLinkedInFromSetup(page: Page): Promise<void> {
  await step(page, "linkedin")
    .getByRole("link", { name: "Connect LinkedIn" })
    .click();
  await expect(page).toHaveURL(/#\/integrations\?connect=linkedin$/);
  const dialog = page.getByRole("dialog", { name: "LinkedIn connection" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Connect LinkedIn account" })
    .click();
  await dialog.getByLabel("Sign-in code").fill("manual-code");
  await dialog.getByRole("button", { name: "Finish connecting" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
}

async function connectClaudeFromSetup(page: Page): Promise<void> {
  await step(page, "ai").getByRole("link", { name: "Connect Claude" }).click();
  await expect(page).toHaveURL(/#\/integrations\?connect=anthropic$/);
  const dialog = page.getByRole("dialog", { name: "Anthropic connection" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Anthropic API key or OAuth token")
    .fill("test-key-00000000");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(
    dialog.getByText("Connected. Your key is stored safely"),
  ).toBeVisible();
}

async function backToSetup(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await launcher(page).click();
  await expect(page).toHaveURL(/#\/setup$/);
}

test("fresh start shows the checklist with LinkedIn first", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const card = checklist(page);
  await expect(card).toBeVisible();
  await expect(card.getByText("0 of 4 done")).toBeVisible();
  await expect(launcher(page)).toContainText("0 of 4");
  // The checklist replaces the old empty card; the header button stays.
  await expect(page.getByText("No campaigns yet")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New campaign" }),
  ).toBeVisible();

  const steps = card.getByRole("listitem");
  await expect(steps).toHaveCount(4);
  await expect(steps.first()).toHaveAttribute(
    "data-testid",
    "setup-step-linkedin",
  );
  await expect(
    steps.nth(0).getByRole("link", { name: "Connect LinkedIn" }),
  ).toBeVisible();
  await expect(
    steps.nth(1).getByRole("link", { name: "Connect Claude" }),
  ).toBeVisible();
  await expect(
    steps.nth(2).getByRole("link", { name: "Describe your style" }),
  ).toBeVisible();
  await expect(
    steps.nth(3).getByRole("link", { name: "Create campaign" }),
  ).toBeVisible();
});

test("each setup step opens the exact dialog or field", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // AI: other services live under "More AI services".
  await step(page, "ai")
    .getByRole("button", { name: "More AI services" })
    .click();
  await page.getByRole("menuitem", { name: "DeepSeek" }).click();
  await expect(page).toHaveURL(/#\/integrations\?connect=deepseek$/);
  const deepSeek = page.getByRole("dialog", { name: "DeepSeek connection" });
  await expect(deepSeek).toBeVisible();
  // Closing a link-opened dialog drops the param (replace, no reopen).
  await page.keyboard.press("Escape");
  await expect(deepSeek).toBeHidden();
  await expect(page).toHaveURL(/#\/integrations$/);
  // LinkedIn's card comes first on Connected accounts.
  await expect(page.getByRole("heading", { level: 3 }).first()).toHaveText(
    "LinkedIn",
  );

  await launcher(page).click();
  await step(page, "voice")
    .getByRole("link", { name: "Describe your style" })
    .click();
  await expect(page).toHaveURL(/#\/playbooks\?focus=linkedin_writer$/);
  await expect(page.locator("#linkedin_writer-custom")).toBeFocused();

  await launcher(page).click();
  await step(page, "campaign")
    .getByRole("link", { name: "Create campaign" })
    .click();
  await expect(page).toHaveURL(/#\/campaigns\?new=1$/);
  const newCampaign = page.getByRole("dialog", { name: "New campaign" });
  await expect(newCampaign).toBeVisible();
  await expect(newCampaign.getByLabel("Name")).toHaveValue("My posts");
  await page.keyboard.press("Escape");
  await expect(newCampaign).toBeHidden();
  await expect(page).toHaveURL(/#\/campaigns$/);
  // Nothing was created by opening the dialog.
  await expect(checklist(page).getByText("0 of 4 done")).toBeVisible();
});

test("partial completion counts connected LinkedIn and Claude", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await connectLinkedInFromSetup(page);
  await backToSetup(page);
  await expect(step(page, "linkedin")).toHaveAttribute("data-state", "done");
  await expect(launcher(page)).toContainText("1 of 4");

  await connectClaudeFromSetup(page);
  await backToSetup(page);
  await expect(step(page, "ai")).toHaveAttribute("data-state", "done");
  await expect(checklist(page).getByText("2 of 4 done")).toBeVisible();
  await expect(launcher(page)).toContainText("2 of 4");
  // The next step to do gets the filled button.
  await expect(
    step(page, "voice").getByRole("link", { name: "Describe your style" }),
  ).toBeVisible();
});

/** Counts `hashchange` events so a test can prove it never navigated. */
async function trackHashChanges(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as Window & { __linkgoHashChanges?: number };
    target.__linkgoHashChanges = 0;
    window.addEventListener("hashchange", () => {
      target.__linkgoHashChanges = (target.__linkgoHashChanges ?? 0) + 1;
    });
  });
}

async function hashChangeCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as Window & { __linkgoHashChanges?: number })
        .__linkgoHashChanges ?? 0,
  );
}

test("saving the writer guide updates progress without navigating", async ({
  page,
}) => {
  await page.goto("/#/playbooks?focus=linkedin_writer", {
    waitUntil: "domcontentloaded",
  });
  await expect(launcher(page)).toContainText("0 of 4");
  await trackHashChanges(page);

  const instructions = page.locator("#linkedin_writer-custom");
  await instructions.fill("Short, concrete lessons from building products.");
  await instructions
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]")
    .getByRole("button", { name: "Save guide" })
    .click();

  await expect(
    page.getByRole("link", { name: /^Get started 1 of 4/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/playbooks\?focus=linkedin_writer$/);
  expect(await hashChangeCount(page)).toBe(0);
});

test("a saved style only counts while the writer guide is on", async ({
  page,
}) => {
  await page.goto("/#/playbooks?focus=linkedin_writer", {
    waitUntil: "domcontentloaded",
  });
  const instructions = page.locator("#linkedin_writer-custom");
  const toggle = page.locator("#linkedin_writer-enabled");
  const save = instructions
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]")
    .getByRole("button", { name: "Save guide" });

  // Style written but the guide is off: drafts would ignore it.
  await instructions.fill("Short, concrete lessons from building products.");
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await save.click();
  await expect(save).toBeDisabled();

  await page.goto("/#/setup", { waitUntil: "domcontentloaded" });
  const voice = step(page, "voice");
  await expect(voice).toHaveAttribute("data-state", "todo");
  await expect(voice).toContainText("the LinkedIn Writer guide is off");
  await expect(launcher(page)).toContainText("0 of 4");
  await voice.getByRole("link", { name: "Turn on the guide" }).click();
  await expect(page).toHaveURL(/#\/playbooks\?focus=linkedin_writer$/);

  // Turning the guide back on finishes the step.
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await save.click();
  await expect(save).toBeDisabled();

  await page.goto("/#/setup", { waitUntil: "domcontentloaded" });
  await expect(step(page, "voice")).toHaveAttribute("data-state", "done");
  await expect(launcher(page)).toContainText("1 of 4");
});

test("connecting LinkedIn from its card updates progress without navigating", async ({
  page,
}) => {
  await page.goto("/#/integrations", { waitUntil: "domcontentloaded" });
  await expect(launcher(page)).toContainText("0 of 4");
  await trackHashChanges(page);

  const linkedinCard = page
    .getByText("LinkedIn", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await linkedinCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "LinkedIn connection" });
  await dialog
    .getByRole("button", { name: "Connect LinkedIn account" })
    .click();
  await dialog.getByLabel("Sign-in code").fill("manual-code");
  await dialog.getByRole("button", { name: "Finish connecting" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole("link", { name: /^Get started 1 of 4/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/integrations$/);
  expect(await hashChangeCount(page)).toBe(0);
});

test("hide setup survives reload and can be resumed", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(checklist(page)).toBeVisible();

  await page.getByRole("button", { name: "Hide setup" }).click();
  await expect(checklist(page)).toHaveCount(0);
  await expect(page.getByText("No campaigns yet")).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("No campaigns yet")).toBeVisible();
  await expect(checklist(page)).toHaveCount(0);
  const resume = page.getByRole("button", { name: "Resume setup" });
  await expect(resume).toBeVisible();

  await resume.click();
  await expect(page).toHaveURL(/#\/setup$/);
  await expect(checklist(page)).toBeVisible();
  await expect(launcher(page)).toContainText("0 of 4");
  await expect(page.getByRole("button", { name: "Resume setup" })).toHaveCount(
    0,
  );
});

test("completing every step ends on find your first idea", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await connectLinkedInFromSetup(page);
  await backToSetup(page);
  await connectClaudeFromSetup(page);
  await backToSetup(page);

  await step(page, "voice")
    .getByRole("link", { name: "Describe your style" })
    .click();
  const instructions = page.locator("#linkedin_writer-custom");
  await expect(instructions).toBeFocused();
  await instructions.fill("Short, concrete lessons from building products.");
  await page
    .locator("#linkedin_writer-custom")
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]")
    .getByRole("button", { name: "Save guide" })
    .click();
  await expect(instructions).toHaveValue(
    "Short, concrete lessons from building products.",
  );

  await launcher(page).click();
  await expect(launcher(page)).toContainText("3 of 4");
  await step(page, "campaign")
    .getByRole("link", { name: "Create campaign" })
    .click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await expect(dialog.getByLabel("Name")).toHaveValue("My posts");
  await dialog.getByLabel("Product").fill("A local-first LinkedIn helper");
  await dialog.getByLabel("Audience").fill("Solo founders");
  await dialog.getByLabel("Voice").fill("Concrete and practical");
  await dialog.getByLabel("Tone").fill("Helpful");
  await dialog.getByLabel("Manual keywords").fill("founder content");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("My posts").first()).toBeVisible();

  // Setup is complete: the launcher offers one last step, then goes away.
  const done = page.getByRole("link", { name: /You.re all set/ });
  await expect(done).toBeVisible();
  await expect(launcher(page)).toHaveCount(0);

  await page.goto("/#/setup", { waitUntil: "domcontentloaded" });
  const card = checklist(page);
  await expect(card.getByText("4 of 4 done")).toBeVisible();
  await card.getByRole("link", { name: "Find your first idea" }).click();
  await expect(page).toHaveURL(/#\/queue\?find=1$/);
  await expect(page.getByRole("dialog", { name: "Find topics" })).toBeVisible();
});

test("locked screens offer a create-campaign button", async ({ page }) => {
  for (const hash of ["#/queue", "#/drafts", "#/comments", "#/backlog"]) {
    await page.goto(`/${hash}`, { waitUntil: "domcontentloaded" });
    const fix = page
      .getByRole("main")
      .getByRole("link", { name: "Create your first campaign" });
    await expect(fix).toBeVisible();
  }
  await page
    .getByRole("main")
    .getByRole("link", { name: "Create your first campaign" })
    .click();
  await expect(page).toHaveURL(/#\/campaigns\?new=1$/);
  await expect(
    page.getByRole("dialog", { name: "New campaign" }).getByLabel("Name"),
  ).toHaveValue("My posts");
});
