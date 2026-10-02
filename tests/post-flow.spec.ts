import { expect, test, type Locator, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

// Synthetic data only: every invoke is answered by the stateful Tauri mocks.
test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

/** Counts the clicks and dialogs on the measured idea → calendar path. */
class FlowCounter {
  clicks = 0;
  dialogs = 0;

  async click(target: Locator): Promise<void> {
    this.clicks += 1;
    await target.click();
  }

  async openDialog(page: Page, trigger: Locator, name: string) {
    this.dialogs += 1;
    await this.click(trigger);
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog).toBeVisible();
    return dialog;
  }
}

async function createCampaign(
  page: Page,
  { navigate = true }: { navigate?: boolean } = {},
): Promise<void> {
  if (navigate) await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name").fill("Founder playbook");
  await dialog.getByLabel("Product").fill("Local LinkedIn cockpit");
  await dialog.getByLabel("Audience").fill("Founders");
  await dialog.getByLabel("Voice").fill("Concrete");
  await dialog.getByLabel("Tone").fill("Helpful");
  await dialog.getByLabel("Manual keywords").fill("founder content");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function addIdea(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Ideas/ }).click();
  await page.getByRole("button", { name: "Add idea" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add idea" });
  await dialog
    .getByLabel("LinkedIn post URL")
    .fill("https://www.linkedin.com/posts/flow-activity-1/");
  await dialog.getByLabel("Post text").fill("A sharp founder post.");
  await dialog.getByLabel("Author name").fill("Jane Flow");
  await dialog
    .getByLabel("Author profile URL")
    .fill("https://www.linkedin.com/in/jane-flow/");
  await dialog.getByLabel("Posted at").fill("2026-06-25");
  await dialog.getByLabel("Source keyword").fill("founder");
  await dialog.getByLabel("Match score").fill("87");
  await dialog.getByLabel("Score reason").fill("Overlap");
  await dialog.getByRole("button", { name: "Add idea" }).click();
  await expect(dialog).toBeHidden();
}

function tracker(scope: Locator): Locator {
  return scope.getByRole("list", { name: "Post progress" });
}

async function expectStage(scope: Locator, label: string): Promise<void> {
  await expect(tracker(scope).locator('[aria-current="step"]')).toContainText(
    label,
  );
}

test("walks one idea to a planned, scheduled post through next-step buttons", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await createCampaign(page);
  await addIdea(page);
  const counter = new FlowCounter();
  const tabs = page.getByRole("navigation");

  // ---- 1. Idea → Write post: the idea is locked in, Practice is explicit.
  const ideaCard = page.locator(".linkgo-card", { hasText: "Jane Flow" });
  await expectStage(ideaCard, "Idea");
  let write = await counter.openDialog(
    page,
    ideaCard.getByRole("button", { name: "Write post" }),
    "Write versions with AI",
  );
  await expect(page).toHaveURL(/#\/drafts\?.*write=1/);
  await expect(write.getByTestId("generate-draft-locked-idea")).toContainText(
    "Jane Flow",
  );
  await expect(write.getByRole("combobox", { name: "Idea" })).toHaveCount(0);
  await expect(
    write.getByTestId("generate-draft-practice-notice"),
  ).toContainText("no AI used");

  // ---- 2. Type an angle, Cancel, go Back, reopen: the angle is kept.
  await write.getByLabel("Angle").fill("Operator lesson");
  await write.getByRole("button", { name: "Cancel" }).click();
  await expect(write).toBeHidden();
  await expect(page).not.toHaveURL(/write=1/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Ideas", exact: true }),
  ).toBeVisible();
  await ideaCard.getByRole("button", { name: "Write post" }).click();
  write = page.getByRole("dialog", { name: "Write versions with AI" });
  await expect(write.getByLabel("Angle")).toHaveValue("Operator lesson");

  // ---- 3. Generate → save → choose → pass checks → Send for approval.
  await counter.click(write.getByRole("button", { name: "Write versions" }));
  await expect(write).toBeHidden();
  await counter.click(page.getByRole("button", { name: "Save as draft" }));
  const draftCard = page
    .locator(".linkgo-card", { hasText: "Jane Flow" })
    .first();
  await expectStage(draftCard, "Draft");
  const sendFromDraft = draftCard.getByRole("button", {
    name: "Send for approval",
  });
  await expect(sendFromDraft).toBeDisabled();
  await expect(draftCard).toContainText(
    "Choose a version and pass checks first.",
  );
  await counter.click(
    page.getByRole("button", { name: "Choose this version" }).first(),
  );
  const audit = page.getByRole("region", { name: "AI review for version 1" });
  await counter.click(audit.getByRole("button", { name: "Review with AI" }));
  await expect(audit.getByText("Done", { exact: true })).toBeVisible();
  await counter.click(
    page.getByRole("button", { name: "Improve with AI" }).first(),
  );
  await counter.click(page.getByRole("button", { name: "Yes, improve it" }));
  await expect(page.getByText("Done improving your draft")).toBeVisible();
  await expect(sendFromDraft).toBeEnabled();

  // ---- 4. Send dialog opens with the draft locked; notes survive Back/Forward.
  let send = await counter.openDialog(page, sendFromDraft, "Send for approval");
  await expect(page).toHaveURL(/#\/approvals\?.*send=1/);
  await expect(send.getByTestId("approval-locked-draft")).toContainText(
    "Jane Flow",
  );
  await expect(send.getByRole("combobox", { name: "Ready draft" })).toHaveCount(
    0,
  );
  await send.getByLabel("Reviewer notes").fill("Human pass on tone");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Drafts", exact: true }),
  ).toBeVisible();
  await page.goForward();
  send = page.getByRole("dialog", { name: "Send for approval" });
  await expect(send.getByLabel("Reviewer notes")).toHaveValue(
    "Human pass on tone",
  );
  await counter.click(send.getByRole("button", { name: "Send for approval" }));
  await expect(send).toBeHidden();

  // ---- 5. The approval waits for a human; no scheduling before Approve.
  await expect(page).toHaveURL(/#\/approvals\?.*approvalId=\d+/);
  const approvalCard = page.locator('[data-highlighted="true"]');
  await expect(approvalCard).toContainText("Jane Flow");
  await expectStage(approvalCard, "Waiting for your OK");
  await expect(
    approvalCard.getByRole("button", { name: "Pick a time" }),
  ).toHaveCount(0);
  await expect(
    approvalCard.getByRole("button", { name: "See on calendar" }),
  ).toHaveCount(0);

  // ---- 6. Approve → Pick a time → See on calendar → Add to plan.
  await counter.click(
    approvalCard.getByRole("button", { name: "Approve", exact: true }),
  );
  await expectStage(approvalCard, "Scheduled");
  await expect(approvalCard).toContainText("Approved — pick a time");
  const schedule = await counter.openDialog(
    page,
    approvalCard.getByRole("button", { name: "Pick a time" }),
    "Schedule post",
  );
  await schedule.getByLabel("Date and time").fill("2026-11-02T09:30");
  await schedule.getByLabel("Time zone").fill("Europe/London");
  await counter.click(schedule.getByRole("button", { name: "Schedule post" }));
  await expect(schedule).toBeHidden();
  await expect(approvalCard).toContainText("Scheduled");
  await expect(
    approvalCard.getByRole("button", { name: "Pick a time" }),
  ).toHaveCount(0);

  await counter.click(
    approvalCard.getByRole("button", { name: "See on calendar" }),
  );
  await expect(page).toHaveURL(/#\/calendar\?.*approvalId=\d+/);
  const unplanned = page.getByTestId("calendar-link-unplanned");
  await expect(unplanned).toContainText("isn't on your plan yet");
  const plan = await counter.openDialog(
    page,
    unplanned.getByRole("button", { name: "Add to plan" }),
    "Plan a post",
  );
  await expect(plan.getByLabel("Date and time")).toHaveValue(
    "2026-11-02T09:30",
  );
  await expect(plan.getByLabel("Time zone")).toHaveValue("Europe/London");
  await plan.getByLabel("Angle").fill("Operator lesson");
  await plan.getByLabel("Look and feel").fill("Text only");
  await plan.getByLabel("Call to action").fill("Save this");
  await counter.click(plan.getByRole("button", { name: "Plan post" }));
  await expect(plan).toBeHidden();
  const slot = page.locator('[data-highlighted="true"]');
  await expect(slot).toContainText("Jane Flow");
  await expect(unplanned).toBeHidden();

  // ---- 7. Every card tells the same story.
  await tabs.getByRole("button", { name: /^Ideas/ }).click();
  await expectStage(ideaCard, "Scheduled");
  await expect(
    ideaCard.getByRole("button", { name: "See on calendar" }),
  ).toBeVisible();
  await tabs.getByRole("button", { name: /^Drafts/ }).click();
  await expectStage(
    page.locator(".linkgo-card", { hasText: "Jane Flow" }).first(),
    "Scheduled",
  );

  // ---- 8. Documented in docs/features/post-flow.md ("After").
  expect({ clicks: counter.clicks, dialogs: counter.dialogs }).toEqual({
    clicks: 15,
    dialogs: 4,
  });
});

test("Practice mode is explicit and only the default without an AI account", async ({
  page,
}) => {
  await createCampaign(page);
  await addIdea(page);

  const ideaCard = page.locator(".linkgo-card", { hasText: "Jane Flow" });
  await ideaCard.getByRole("button", { name: "Write post" }).click();
  let write = page.getByRole("dialog", { name: "Write versions with AI" });
  await expect(write.getByLabel("AI service")).toHaveValue("dry_run");
  const notice = write.getByTestId("generate-draft-practice-notice");
  await expect(notice).toContainText("Practice mode — no AI used");
  await expect(
    notice.getByRole("link", { name: "Connect an AI account" }),
  ).toHaveAttribute("href", "#/integrations");
  await write.getByRole("button", { name: "Cancel" }).click();

  await page.evaluate(async () => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args: unknown) => Promise<unknown>;
      };
    };
    await w.__TAURI_INTERNALS__.invoke("linkgo_auth_api_key", {
      input: { providerKey: "openai", apiKey: "sk-test-flow-0000" },
    });
  });
  // Accounts are read when the screen mounts, so leave Drafts and come back
  // (a reload would wipe the in-page mock data).
  await page.getByRole("button", { name: /^Ideas/ }).click();
  await page.getByRole("button", { name: /^Drafts/ }).click();
  await page.getByRole("button", { name: "Write with AI" }).click();
  write = page.getByRole("dialog", { name: "Write versions with AI" });
  await expect(write.getByLabel("AI service")).toHaveValue("openai");
  await expect(write.getByTestId("generate-draft-practice-notice")).toHaveCount(
    0,
  );
  // Choosing Practice by hand still shows the notice, without the connect link.
  await write.getByLabel("AI service").selectOption("dry_run");
  const practice = write.getByTestId("generate-draft-practice-notice");
  await expect(practice).toContainText("no AI used");
  await expect(
    practice.getByRole("link", { name: "Connect an AI account" }),
  ).toHaveCount(0);
});

test("disabled next steps explain why and link to the fix", async ({
  page,
}) => {
  await page.goto("/#/drafts", { waitUntil: "domcontentloaded" });
  const writeButton = page.getByRole("button", { name: "Write with AI" });
  await expect(writeButton).toBeDisabled();
  await expect(writeButton).toHaveAccessibleDescription(
    /Create a campaign first/,
  );
  await expect(
    page.getByRole("link", { name: "Go to Campaigns" }),
  ).toHaveAttribute("href", "#/campaigns");

  await page.getByRole("button", { name: /^Campaigns/ }).click();
  await createCampaign(page, { navigate: false });
  await page.getByRole("button", { name: /^Drafts/ }).click();
  await expect(writeButton).toHaveAccessibleDescription(
    /No ideas left to write/,
  );
  await expect(page.getByRole("link", { name: "Go to Ideas" })).toHaveAttribute(
    "href",
    "#/queue",
  );

  await page.getByRole("button", { name: /^Approvals/ }).click();
  const sendButton = page.getByRole("button", { name: "Send for approval" });
  await expect(sendButton).toBeDisabled();
  await expect(sendButton).toHaveAccessibleDescription(
    /No checked drafts to send yet/,
  );
  await expect(
    page.getByRole("link", { name: "Go to Drafts" }),
  ).toHaveAttribute("href", /^#\/drafts\?campaignId=\d+$/);
});

test("untrusted links fall back with a plain notice and open nothing", async ({
  page,
}) => {
  await createCampaign(page);
  await page.goto("/#/approvals?campaignId=1&draftId=999&send=1");
  await expect(page.getByTestId("approvals-link-notice")).toContainText(
    "isn't ready to send yet",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/#/calendar?campaignId=1&approvalId=999");
  await expect(page.getByTestId("calendar-link-notice")).toContainText(
    "isn't approved yet",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
