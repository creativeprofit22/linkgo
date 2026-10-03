import AxeBuilder from "@axe-core/playwright";
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
  await expect(
    page.getByRole("heading", { name: "Version 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Version 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This variant has draft text to review.").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Worth a look", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Quality score/ }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByText("Scores five things out of 100. A draft needs 70 to pass.")
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Improve with AI" }).first(),
  ).toBeDisabled();
});

test("generates distinct dry-run provider variants and saves their exact text", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await generateDraftVariants(page);

  await expect(page.getByText("AI draft #1")).toBeVisible();
  await expect(
    page.getByText("Accepted 3 provider-authored draft variants."),
  ).toBeVisible();
  const agentInput = await page.evaluate(() => {
    const getAgentRuns = (
      window as unknown as {
        __LINKGO_SQL_AGENT_RUNS__: () => Array<{
          input_summary: string;
          input_context_json: string;
        }>;
      }
    ).__LINKGO_SQL_AGENT_RUNS__;
    const run = getAgentRuns()[0];
    return {
      summary: run?.input_summary ?? "",
      context: JSON.parse(run?.input_context_json ?? "{}") as Record<
        string,
        unknown
      >,
    };
  });
  expect(agentInput.summary).toContain(
    "Create exactly 3 LinkedIn draft variants using the fixed idea",
  );
  expect(agentInput.summary).not.toContain("This founder post has a sharp ICP");
  expect(agentInput.summary).not.toContain("Jane Operator");
  expect(agentInput.context).toMatchObject({
    draftRequest: {
      draftGenerationRequestId: 1,
      variantCount: 3,
      contentIntent: "idea",
    },
    referenceData: {
      candidate: {
        targetAuthorName: "Jane Operator",
        targetContent: "This founder post has a sharp ICP signal.",
      },
    },
  });

  const generatedVariants = await getGeneratedVariants(page, 1);
  expect(generatedVariants.map((variant) => variant.hook)).toEqual([
    "Dry-run provider hook 1: idea insight",
    "Dry-run provider hook 2: idea insight",
    "Dry-run provider hook 3: idea insight",
  ]);
  expect(new Set(generatedVariants.map((variant) => variant.body)).size).toBe(
    3,
  );

  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(
    page.getByRole("heading", { name: "AI drafts to review" }),
  ).toBeHidden();
  await expect(page.getByText("AI draft #1")).toBeHidden();

  const savedVariants = await getSavedDraftVariants(page);
  expect(
    savedVariants.map(({ hook, body, cta }) => ({ hook, body, cta })),
  ).toEqual(
    generatedVariants.map(({ hook, body, cta }) => ({ hook, body, cta })),
  );
  await expect(
    page.getByRole("heading", { name: "Jane Operator" }),
  ).toBeVisible();
  await expect(
    page.getByText("This variant has draft text to review.").first(),
  ).toBeVisible();
  await expect(page.getByText("Idea post").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Write with AI" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Create draft" }),
  ).toBeDisabled();
});

test("persists and saves distinct connected-provider authored variants", async ({
  page,
}) => {
  const authoredVariants: GeneratedVariantRecord[] = [
    {
      hook: "A provider found the first concrete signal",
      body: "Provider body one explains the signal with a specific operator example.",
      cta: "Compare this first provider lesson.",
      hashtags: ["#ProviderOne"],
    },
    {
      hook: "The second provider angle starts with the constraint",
      body: "Provider body two describes the constraint and the decision it changed.",
      cta: "Save the second provider framework.",
      hashtags: ["#ProviderTwo"],
    },
    {
      hook: "Provider variant three leads with the outcome",
      body: "Provider body three connects the outcome to a repeatable workflow.",
      cta: "Try the third provider workflow.",
      hashtags: ["#ProviderThree"],
    },
  ];
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await connectCustomProvider(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await installAuthoredDraftProvider(page, authoredVariants);

  await generateDraftVariants(page, "Other AI service");

  expect(await getGeneratedVariants(page, 1)).toEqual(authoredVariants);
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("AI draft #1")).toBeHidden();
  const savedVariants = await getSavedDraftVariants(page);
  expect(
    savedVariants.map(({ hook, body, cta, hashtags }) => ({
      hook,
      body,
      cta,
      hashtags: hashtags.split(" ").filter(Boolean),
    })),
  ).toEqual(authoredVariants);
});

test("rejects count-mismatched and malformed provider arrays atomically", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await connectCustomProvider(page);
  await page.getByRole("button", { name: /Campaigns/ }).click();
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await installInvalidDraftProvider(page);

  await generateDraftVariants(page, "Other AI service", false);
  await expect(
    page.getByText("The AI couldn't write versions").last(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("The AI couldn't write versions").last(),
  ).toBeHidden();

  await generateDraftVariants(page, "Other AI service", false);
  await expect(
    page.getByText("The AI couldn't write versions").last(),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const atomicState = await page.evaluate(() => {
    const mocks = window as unknown as {
      __LINKGO_SQL_DRAFT_GENERATION_REQUESTS__: () => Array<{
        status: string;
        generated_variants_json: string;
      }>;
      __LINKGO_SQL_STATE_COUNTS__: () => {
        drafts: number;
        draftVariants: number;
        agentToolCalls: number;
      };
    };
    return {
      requests: mocks.__LINKGO_SQL_DRAFT_GENERATION_REQUESTS__(),
      counts: mocks.__LINKGO_SQL_STATE_COUNTS__(),
    };
  });
  expect(atomicState.requests).toHaveLength(2);
  expect(
    atomicState.requests.map(({ status, generated_variants_json }) => ({
      status,
      generated_variants_json,
    })),
  ).toEqual([
    { status: "failed", generated_variants_json: "[]" },
    { status: "failed", generated_variants_json: "[]" },
  ]);
  expect(atomicState.counts).toMatchObject({
    drafts: 0,
    draftVariants: 0,
    agentToolCalls: 0,
  });
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
  await expect(page.getByText("AI draft #1")).toBeVisible();

  await page.getByRole("button", { name: "Dismiss" }).click();

  await expect(
    page.getByRole("heading", { name: "AI drafts to review" }),
  ).toBeHidden();
  await expect(page.getByText("AI draft #1")).toBeHidden();
});

test("persists a failed generation request and dismisses it", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await page.getByRole("button", { name: "Write with AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Write versions with AI" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("AI service").selectOption({ label: "OpenAI" });
  await dialog
    .getByLabel("Angle")
    .fill("Turn this into a concrete operator lesson");
  await dialog.getByRole("button", { name: "Write versions" }).click();

  await expect(page.getByText("The AI couldn't write versions")).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: "Your AI service isn't connected" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("AI draft #1")).toBeVisible();
  await expect(getBadge(page, "Didn't finish")).toBeVisible();
  await expect(
    page.locator("p").filter({ hasText: "Your AI service isn't connected" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Dismiss failed draft" }).click();

  await expect(
    page.getByRole("heading", { name: "AI drafts to review" }),
  ).toBeHidden();
  await expect(page.getByText("AI draft #1")).toBeHidden();
});

for (const { authMethod, expectedModel } of [
  { authMethod: "oauth", expectedModel: "gpt-6-sol" },
  { authMethod: "api_key", expectedModel: "gpt-4.1-mini" },
] as const) {
  test(`defaults the OpenAI model to ${expectedModel} for a ${authMethod} account`, async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      (method) =>
        (
          window as unknown as {
            __LINKGO_AUTH_SEED_AI_ACCOUNT__: (
              providerKey: string,
              authMethod: string,
            ) => void;
          }
        ).__LINKGO_AUTH_SEED_AI_ACCOUNT__("openai", method),
      authMethod,
    );
    await createCampaign(page);
    await openQueue(page);
    await addCandidate(page);
    await openDrafts(page);

    await page.getByRole("button", { name: "Write with AI" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Write versions with AI",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("AI service").selectOption({ label: "OpenAI" });

    await expect(dialog.getByLabel("AI model")).toHaveValue(expectedModel);
  });
}

for (const { state, expectedProvider } of [
  { state: "expired", expectedProvider: "anthropic" },
  { state: "reauth_required", expectedProvider: "dry_run" },
] as const) {
  test(`defaults the AI service to ${expectedProvider} for an Anthropic sign-in that is ${state}`, async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate((nextState) => {
      const hooks = window as unknown as {
        __LINKGO_AUTH_SEED_AI_ACCOUNT__: (
          providerKey: string,
          authMethod: string,
        ) => void;
        __LINKGO_AUTH_EXPIRE_SIGN_IN__: (key: string) => void;
        __LINKGO_AUTH_REQUIRE_REAUTH__: (key: string, error: string) => void;
      };
      hooks.__LINKGO_AUTH_SEED_AI_ACCOUNT__("anthropic", "oauth");
      if (nextState === "expired")
        hooks.__LINKGO_AUTH_EXPIRE_SIGN_IN__("anthropic");
      else
        hooks.__LINKGO_AUTH_REQUIRE_REAUTH__(
          "anthropic",
          "Sign-in expired or was revoked; reconnect this provider",
        );
    }, state);
    await createCampaign(page);
    await openQueue(page);
    await addCandidate(page);
    await openDrafts(page);

    await page.getByRole("button", { name: "Write with AI" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Write versions with AI",
    });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByLabel("AI service")).toHaveValue(expectedProvider);
  });
}

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
    page.getByRole("button", { name: "Write with AI" }),
  ).toBeDisabled();
  await openQueue(page);

  await expect(
    page.getByText("Drafted", { exact: true }).first(),
  ).toBeVisible();
});

test("renders accessible AI audit states separately from deterministic checks", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page, [
    cleanVariant(),
    cleanVariant(),
    cleanVariant(),
    cleanVariant(),
  ]);
  await configureAiAuditStates(page);

  await openQueue(page);
  await openDrafts(page);

  const aiAuditPanels = page.getByRole("region", { name: "AI review" });
  await expect(aiAuditPanels).toHaveCount(4);
  await expect(
    page.getByRole("region", { name: "Automatic checks" }),
  ).toHaveCount(4);

  await expect(aiAuditPanels.nth(0)).toContainText("Not checked");
  await expect(aiAuditPanels.nth(0)).toContainText(
    "The AI hasn't reviewed this version yet.",
  );
  await expect(aiAuditPanels.nth(1)).toContainText("In progress");
  await expect(aiAuditPanels.nth(1)).toContainText("Other AI service");
  await expect(aiAuditPanels.nth(1)).toContainText("audit-model-2026");
  await expect(aiAuditPanels.nth(2)).toContainText("Done");
  await expect(aiAuditPanels.nth(2)).toContainText(
    "The draft is specific, useful, and ready for review.",
  );
  await expect(
    aiAuditPanels.nth(2).getByRole("list", { name: "AI review suggestions" }),
  ).toHaveCount(1);
  await expect(aiAuditPanels.nth(2).getByRole("listitem")).toHaveCount(6);
  await expect(aiAuditPanels.nth(2)).toContainText("Opening line");
  await expect(aiAuditPanels.nth(2)).toContainText("Safe to post");
  await expect(aiAuditPanels.nth(3)).toContainText("Didn't finish");
  await expect(aiAuditPanels.nth(3)).toContainText(
    "The provider returned an invalid audit response.",
  );
  await expect(
    page.getByRole("button", { name: "Review with AI" }),
  ).toHaveCount(3);
  await expect(page.getByRole("button", { name: /Reviewing/ })).toBeDisabled();

  const accessibilityScan = await new AxeBuilder({ page })
    .include('section[aria-labelledby*="-ai-audit-title"]')
    .analyze();
  expect(accessibilityScan.violations).toEqual([]);

  const stateNames = ["not-run", "running", "completed", "failed"];
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [index, stateName] of stateNames.entries()) {
    await aiAuditPanels.nth(index).screenshot({
      path: `.gg/screenshots/draft-ai-audit-${stateName}-desktop.png`,
    });
  }

  await page.setViewportSize({ width: 320, height: 1400 });
  await aiAuditPanels.nth(3).scrollIntoViewIfNeeded();
  await expect(aiAuditPanels.nth(3)).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewport);
  for (const [index, stateName] of stateNames.entries()) {
    const panel = page.locator(
      `section[aria-labelledby="variant-${index + 1}-ai-audit-title"]`,
    );
    await panel.evaluate((element, stateIndex) => {
      const marker = document.createElement("span");
      marker.dataset.aiAuditScreenshotMarker = String(stateIndex);
      element.before(marker);
      document.body.append(element);
      element.setAttribute(
        "style",
        "position: fixed; inset: 0 auto auto 0; z-index: 9999; box-sizing: border-box; width: 320px;",
      );
    }, index);
    await panel.screenshot({
      path: `.gg/screenshots/draft-ai-audit-${stateName}-320.png`,
    });
    await panel.evaluate((element, stateIndex) => {
      const marker = document.querySelector(
        `[data-ai-audit-screenshot-marker="${stateIndex}"]`,
      );
      marker?.replaceWith(element);
      element.removeAttribute("style");
    }, index);
  }
});

test("audit blocks external links and too many hashtags", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);

  await createDraft(page, [blockedVariant()]);

  await expect(
    page.getByText("Must fix", { exact: true }).first(),
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

  await page.getByRole("button", { name: "Choose this version" }).click();

  await expect(page.getByText("We couldn't update this version")).toBeVisible();
  await expect(
    page.getByText("Blocked variants cannot be selected"),
  ).toBeVisible();
  await expect(getBadge(page, "Ready for approval")).toBeHidden();
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

  await page.getByRole("button", { name: "Choose this version" }).click();

  await expect(getBadge(page, "Ready for approval")).toBeVisible();
  await expect(getBadge(page, "Chosen")).toBeVisible();
});

test("Send for approval stays disabled with the reason when native readiness blocks it", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await createDraft(page, [cleanVariant()]);

  const draftCard = page
    .locator(".linkgo-card", { hasText: "Jane Operator" })
    .first();
  const send = draftCard.getByRole("button", { name: "Send for approval" });
  await page.getByRole("button", { name: "Choose this version" }).click();
  await expect(getBadge(page, "Ready for approval")).toBeVisible();
  // Chosen and ready_for_review, but checks have not passed on this text yet.
  await expect(send).toBeDisabled();
  await expect(send).toHaveAccessibleDescription(
    "Run the checks on this version's latest text first.",
  );

  const audit = page.getByRole("region", { name: "AI review for version 1" });
  await audit.getByRole("button", { name: "Review with AI" }).click();
  await expect(audit.getByText("Done", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Improve with AI" }).first().click();
  await page.getByRole("button", { name: "Yes, improve it" }).click();
  await expect(page.getByText("Done improving your draft")).toBeVisible();
  await expect(send).toBeEnabled();

  // A block finding (any revision) closes the native create gate.
  await page.evaluate(async () => {
    const w = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
      __LINKGO_DRAFTS_TEST_API__: {
        listDrafts: () => Promise<
          Array<{ variants: Array<{ id: number; status: string }> }>
        >;
      };
    };
    const drafts = await w.__LINKGO_DRAFTS_TEST_API__.listDrafts();
    const variantId = drafts[0]?.variants.find(
      (variant) => variant.status === "selected",
    )?.id;
    if (variantId === undefined) throw new Error("No selected version");
    await w.__TAURI_INTERNALS__.invoke("__linkgo_test_sql|execute", {
      query:
        "INSERT INTO draft_audits (draft_variant_id, rule_key, severity, message) VALUES (?, ?, ?, ?)",
      values: [variantId, "total_length", "block", "Seeded blocking issue."],
    });
  });
  await openCampaigns(page);
  await openDrafts(page);

  await expect(getBadge(page, "Ready for approval")).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(send).toHaveAccessibleDescription(
    "This version has a blocking issue — fix it first.",
  );
  await expect(page).toHaveURL(/#\/drafts/);
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

  await page.getByRole("button", { name: "Edit version" }).click();
  await page
    .locator('[id^="variant-"][id$="-body"]')
    .fill("We tested 12 replies and kept the useful lesson in the post body.");
  await page.getByRole("button", { name: "Save and check again" }).click();

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
    page.getByRole("button", { name: "Write with AI" }),
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
    page.getByRole("button", { name: "Write with AI" }),
  ).toBeDisabled();
});

test("an older campaign response cannot replace the newest draft workspace", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page, "Alpha campaign");
  await createCampaign(page, "Beta campaign");
  await page.evaluate(() => {
    const seed = (
      window as unknown as {
        __LINKGO_SQL_SEED_DRAFT_CAMPAIGN_LOAD__: (
          campaignId: number,
          label: string,
        ) => void;
      }
    ).__LINKGO_SQL_SEED_DRAFT_CAMPAIGN_LOAD__;
    seed(1, "Alpha");
    seed(2, "Beta");
  });
  await openDrafts(page);

  const campaignSelect = page.getByRole("combobox").first();
  await campaignSelect.selectOption({ label: "Alpha campaign" });
  await expect(
    page.getByRole("heading", { name: "Alpha draft author" }),
  ).toBeVisible();

  await page.evaluate(() => {
    const mock = window as unknown as {
      __LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__: (campaignId: number) => void;
    };
    mock.__LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__(1);
    mock.__LINKGO_SQL_DELAY_CAMPAIGN_SELECTS__(2);
  });

  await page.getByRole("button", { name: "Choose this version" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__: (
              campaignId: number,
            ) => number;
          }
        ).__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__(1),
      ),
    )
    .toBe(4);

  await page.evaluate(() => {
    const select = Array.from(document.querySelectorAll("select")).find(
      (candidate) =>
        Array.from(candidate.options).some(
          (option) => option.textContent?.trim() === "Beta campaign",
        ),
    );
    if (!select) throw new Error("Campaign select was not found");
    select.value = "2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__: (
              campaignId: number,
            ) => number;
          }
        ).__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__(2),
      ),
    )
    .toBe(4);

  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__: (campaignId: number) => void;
      }
    ).__LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__(2);
  });
  await expect(
    page.getByRole("heading", { name: "Beta draft author" }),
  ).toBeVisible();
  await expect(page.getByText("Beta generation request")).toBeVisible();

  await page.evaluate(() => {
    (
      window as unknown as {
        __LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__: (campaignId: number) => void;
      }
    ).__LINKGO_SQL_RELEASE_CAMPAIGN_SELECTS__(1);
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__: (
              campaignId: number,
            ) => number;
          }
        ).__LINKGO_SQL_DELAYED_CAMPAIGN_SELECT_COUNT__(1),
      ),
    )
    .toBe(0);

  await expect(
    page.getByRole("heading", { name: "Beta draft author" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Alpha draft author" }),
  ).toBeHidden();
  await expect(page.getByText("Beta generation request")).toBeVisible();
  await expect(page.getByText("Alpha generation request")).toBeHidden();

  await page.getByRole("button", { name: "Write with AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Write versions with AI" });
  await expect(dialog.getByLabel("Idea", { exact: true })).toContainText(
    "Beta draft author",
  );
  await expect(dialog.getByLabel("Idea", { exact: true })).not.toContainText(
    "Alpha draft author",
  );
  await expect(dialog.getByLabel("Automation")).toContainText("Beta workflow");
  await expect(dialog.getByLabel("Automation")).not.toContainText(
    "Alpha workflow",
  );
});

test("drops a remembered automation that is no longer eligible", async ({
  page,
}) => {
  // Cancel/Back remembered an automation that has since finished.
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "linkgo.form.write.1",
      JSON.stringify({
        providerKey: null,
        modelName: null,
        playbookKey: "linkedin_writer",
        variantCount: "3",
        contentIntent: "idea",
        workflowRunId: "999",
        angle: "Remembered operator angle",
        voiceNotes: "",
      }),
    );
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await page.evaluate(() => {
    const target = window as unknown as {
      __TAURI_INTERNALS__?: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
      __LINKGO_DRAFT_CLAIM_INPUTS__?: unknown[];
    };
    const internals = target.__TAURI_INTERNALS__;
    if (internals === undefined) return;
    const originalInvoke = internals.invoke.bind(internals);
    target.__LINKGO_DRAFT_CLAIM_INPUTS__ = [];
    internals.invoke = (cmd: string, args?: unknown) => {
      if (cmd === "linkgo_draft_generation_claim") {
        target.__LINKGO_DRAFT_CLAIM_INPUTS__?.push(
          (args as { input?: unknown } | undefined)?.input,
        );
      }
      return originalInvoke(cmd, args);
    };
  });

  await page.getByRole("button", { name: "Write with AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Write versions with AI" });
  // The remembered form was loaded for this idea.
  await expect(dialog.getByLabel("Angle")).toHaveValue(
    "Remembered operator angle",
  );
  await expect(dialog.getByLabel("Automation")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Write versions" }).click();
  await expect(dialog).toBeHidden();

  const claimInputs = await page.evaluate(
    () =>
      (window as unknown as { __LINKGO_DRAFT_CLAIM_INPUTS__?: unknown[] })
        .__LINKGO_DRAFT_CLAIM_INPUTS__ ?? [],
  );
  expect(claimInputs).toHaveLength(1);
  expect(claimInputs[0]).toMatchObject({
    candidateId: 1,
    workflowRunId: null,
    angle: "Remembered operator angle",
  });
  await expect(page.getByText("AI draft #1")).toBeVisible();
});

interface GeneratedVariantRecord {
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
}

interface SavedDraftVariantRecord {
  id: number;
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

interface VariantFormInput {
  hook: string;
  body: string;
  cta: string;
  hashtags: string;
}

// Status badges only: the post-stage tracker repeats labels like "Posted".
const BADGE_SPAN_SELECTOR = 'span:not([data-testid="post-stage-tracker"] *)';

function getBadge(page: Page, label: string): Locator {
  return page.locator(BADGE_SPAN_SELECTOR).filter({
    hasText: new RegExp(`^${label.replaceAll("'", "\\u0027")}$`, "u"),
  });
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

test("generation controls remain accessible and usable at 320 pixels", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await createCampaign(page);
  await openQueue(page);
  await addCandidate(page);
  await openDrafts(page);
  await page.getByRole("button", { name: "Write with AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Write versions with AI" });
  await expect(dialog).toBeVisible();
  await expectGenerationDialogToBeAccessible(page);

  await page.setViewportSize({ width: 320, height: 760 });
  await expect(dialog.getByRole("group", { name: "Post type" })).toBeVisible();
  await expect(
    dialog.getByLabel("Number of versions").locator("option"),
  ).toHaveCount(3);
  await dialog.getByLabel("Community").check();
  await expect(dialog.getByLabel("Community")).toBeChecked();
  await expectGenerationDialogToBeAccessible(page);
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewport);
  await page.screenshot({
    path: ".gg/screenshots/draft-generation-320.png",
    fullPage: true,
  });
});

async function expectGenerationDialogToBeAccessible(page: Page): Promise<void> {
  const accessibilityScan = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();

  expect(accessibilityScan.violations).toEqual([]);
}

async function getGeneratedVariants(
  page: Page,
  requestId: number,
): Promise<GeneratedVariantRecord[]> {
  return page.evaluate((id) => {
    const getRequests = (
      window as unknown as {
        __LINKGO_SQL_DRAFT_GENERATION_REQUESTS__: () => Array<{
          id: number;
          generated_variants_json: string;
        }>;
      }
    ).__LINKGO_SQL_DRAFT_GENERATION_REQUESTS__;
    const request = getRequests().find((candidate) => candidate.id === id);
    return JSON.parse(request?.generated_variants_json ?? "[]");
  }, requestId);
}

async function configureAiAuditStates(page: Page): Promise<void> {
  const variants = await getSavedDraftVariants(page);
  const findings = [
    "hook",
    "specificity",
    "generic_language",
    "authenticity",
    "clarity",
    "safety",
  ].map((ruleKey) => ({
    ruleKey,
    severity: ruleKey === "authenticity" ? "warning" : "pass",
    message: `Focused ${ruleKey.replaceAll("_", " ")} feedback.`,
  }));

  await page.evaluate(
    async ({ variantIds, findings }) => {
      const data = (
        window as unknown as {
          __LINKGO_DRAFTS_TEST_API__: {
            startDraftAiAuditRun: (input: unknown) => Promise<{ id: number }>;
            completeDraftAiAuditRun: (input: unknown) => Promise<unknown>;
            failDraftAiAuditRun: (input: unknown) => Promise<unknown>;
          };
        }
      ).__LINKGO_DRAFTS_TEST_API__;

      await data.startDraftAiAuditRun({
        draftVariantId: variantIds[1],
        contentRevision: 1,
        providerKey: "custom",
        modelName: "audit-model-2026",
      });

      const completedRun = await data.startDraftAiAuditRun({
        draftVariantId: variantIds[2],
        contentRevision: 1,
        providerKey: "openai",
        modelName: "gpt-audit-2026",
      });
      // The auditor's own persisted output is what native completion reads.
      await (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__.invoke("linkgo_test_record_auditor_output", {
        input: {
          auditRunId: completedRun.id,
          summary: "The draft is specific, useful, and ready for review.",
          findings: findings,
        },
      });
      await data.completeDraftAiAuditRun({
        auditRunId: completedRun.id,
        draftVariantId: variantIds[2],
        contentRevision: 1,
      });

      const failedRun = await data.startDraftAiAuditRun({
        draftVariantId: variantIds[3],
        contentRevision: 1,
        providerKey: "anthropic",
        modelName: "claude-audit-2026",
      });
      await data.failDraftAiAuditRun({
        auditRunId: failedRun.id,
        draftVariantId: variantIds[3],
        contentRevision: 1,
        errorMessage: "The provider returned an invalid audit response.",
      });
    },
    { variantIds: variants.map((variant) => variant.id), findings },
  );
}

async function getSavedDraftVariants(
  page: Page,
): Promise<SavedDraftVariantRecord[]> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __LINKGO_SQL_DRAFT_VARIANTS__: () => SavedDraftVariantRecord[];
      }
    ).__LINKGO_SQL_DRAFT_VARIANTS__(),
  );
}

async function connectCustomProvider(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Connected accounts/ }).click();
  const customCard = page
    .getByText("Other AI service", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Other AI service connection",
  });
  await dialog.getByLabel("Access key").fill("test-custom-api-key");
  await dialog
    .getByLabel("Web address (required)")
    .fill("https://custom.example.com/v1");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

async function installAuthoredDraftProvider(
  page: Page,
  variants: GeneratedVariantRecord[],
): Promise<void> {
  await page.evaluate((authoredVariants) => {
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: (args: unknown) => unknown;
        };
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute: (args: unknown) => {
        const request = (
          args as {
            input: { request: { messages: Array<{ role: string }> } };
          }
        ).input.request;
        if (request.messages.some((message) => message.role === "tool")) {
          return {
            chunks: [
              {
                type: "done",
                outputSummary: "Provider-authored draft generation completed.",
              },
            ],
          };
        }
        return {
          chunks: [
            {
              type: "tool_call",
              providerToolCallId: "provider-authored-drafts",
              toolName: "draft_post",
              input: {
                draftGenerationRequestId: 1,
                campaignId: 1,
                candidatePostId: 1,
                variantCount: 3,
                contentIntent: "idea",
                angle: "Turn this into a concrete operator lesson",
                voiceNotes: "Use the campaign voice.",
                variants: authoredVariants,
              },
            },
            {
              type: "done",
              outputSummary: "Provider requested draft persistence.",
            },
          ],
        };
      },
    };
  }, variants);
}

async function installInvalidDraftProvider(page: Page): Promise<void> {
  await page.evaluate(() => {
    let attempt = 0;
    const validVariants = Array.from({ length: 3 }, (_, index) => ({
      hook: `Provider hook ${index + 1}`,
      body: `Provider body ${index + 1}`,
      cta: `Provider CTA ${index + 1}`,
      hashtags: [`#Provider${index + 1}`],
    }));
    (
      window as unknown as {
        __LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__?: {
          execute: () => unknown;
        };
      }
    ).__LINKGO_AGENT_PROVIDER_COMMAND_TEST_API__ = {
      execute: () => {
        attempt += 1;
        const draftGenerationRequestId = attempt;
        const variants =
          attempt === 1
            ? [...validVariants, { ...validVariants[0] }]
            : validVariants.map((variant, index) =>
                index === 0 ? { ...variant, hook: "   " } : variant,
              );
        return {
          chunks: [
            {
              type: "tool_call",
              providerToolCallId: `invalid-provider-drafts-${attempt}`,
              toolName: "draft_post",
              input: {
                draftGenerationRequestId,
                campaignId: 1,
                candidatePostId: 1,
                variantCount: 3,
                contentIntent: "idea",
                angle: "Turn this into a concrete operator lesson",
                voiceNotes: "Use the campaign voice.",
                variants,
              },
            },
            { type: "done", outputSummary: "Invalid draft response." },
          ],
        };
      },
    };
  });
}

async function openQueue(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Ideas/ }).click();
  await expect(
    page.getByRole("heading", { name: "Ideas", exact: true }),
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
  await page.getByRole("button", { name: "Add idea" }).first().click();
  await expect(page.getByRole("dialog", { name: "Add idea" })).toBeVisible();

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
  await page.getByLabel("Match score").fill("87");
  await page.getByLabel("Score reason").fill("Strong audience overlap.");
  await page.getByLabel("Notes").fill("Good comment opportunity.");
  const dialog = page.getByRole("dialog", { name: "Add idea" });
  await dialog.getByRole("button", { name: "Add idea" }).click();
  await expect(dialog).toBeHidden();
}

async function generateDraftVariants(
  page: Page,
  providerLabel?: string,
  expectSuccess = true,
): Promise<void> {
  await page.getByRole("button", { name: "Write with AI" }).click();
  const dialog = page.getByRole("dialog", { name: "Write versions with AI" });
  await expect(dialog).toBeVisible();
  if (providerLabel !== undefined) {
    await dialog
      .getByLabel("AI service")
      .selectOption({ label: providerLabel });
  }
  await dialog
    .getByLabel("Angle")
    .fill("Turn this into a concrete operator lesson");
  await dialog.getByRole("button", { name: "Write versions" }).click();
  if (expectSuccess) await expect(dialog).toBeHidden();
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
      await page.getByRole("button", { name: "Add version" }).click();
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
