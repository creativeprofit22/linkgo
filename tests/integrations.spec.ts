import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("keeps Xiaomi docs URL in frontend and native provider catalogs", () => {
  const frontendCatalog = readFileSync(
    resolve(process.cwd(), "src/features/integrations/providers.ts"),
    "utf8",
  );
  const nativeCatalog = readFileSync(
    resolve(process.cwd(), "src-tauri/src/auth/providers.rs"),
    "utf8",
  );

  const frontendXiaomiDocsUrl = frontendCatalog.match(
    /key: "xiaomi",[\s\S]*?docsUrl: "([^"]+)"/,
  )?.[1];
  const nativeXiaomiDocsUrl = nativeCatalog.match(
    /key: "xiaomi",[\s\S]*?docs_url: "([^"]+)"/,
  )?.[1];

  expect(frontendXiaomiDocsUrl).toBe("https://mimo.xiaomi.com/");
  expect(nativeXiaomiDocsUrl).toBe(frontendXiaomiDocsUrl);
});

test("connects API-key provider without rendering secrets", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  await expect(
    page.getByRole("heading", { name: "Integrations" }),
  ).toBeVisible();
  for (const provider of [
    "Anthropic",
    "Xiaomi (MiMo)",
    "OpenAI",
    "Gemini",
    "Z.AI (GLM)",
    "Moonshot",
    "DeepSeek",
    "OpenRouter",
    "Sakana",
    "MiniMax",
    "Custom API",
  ]) {
    await expect(page.getByText(provider, { exact: true })).toBeVisible();
  }

  const deepSeekCard = page
    .getByText("DeepSeek", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await deepSeekCard.getByRole("button", { name: "Connect" }).click();

  const dialog = page.getByRole("dialog", { name: "DeepSeek connection" });
  await dialog.getByLabel("DeepSeek API key").fill("sk-test-deepseek-key");
  await dialog.getByLabel("Base URL override").fill("https://api.deepseek.com");
  await dialog.getByLabel("Account label").fill("Test DeepSeek");
  await dialog.getByRole("button", { name: "Save API key" }).click();

  await expect(page.getByText("Connected").first()).toBeVisible();
  await expect(page.getByText("sk-test-deepseek-key")).toBeHidden();
});

test("requires Base URL before saving Custom API key", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();

  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await expect(dialog.getByLabel("Base URL override (required)")).toBeVisible();
  await dialog.getByLabel("Provider API key").fill("sk-test-custom-key");
  await expect(
    dialog.getByRole("button", { name: "Save API key" }),
  ).toBeDisabled();

  await dialog
    .getByLabel("Base URL override (required)")
    .fill("https://custom.example.com/v1");
  await expect(
    dialog.getByRole("button", { name: "Save API key" }),
  ).toBeEnabled();
});

test("rejects direct Custom API key save without Base URL", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => "__LINKGO_INTEGRATIONS_TEST_API__" in window,
  );

  const result = await page.evaluate(async () => {
    const invoke = (
      window as unknown as {
        __TAURI_INTERNALS__?: {
          invoke?: (cmd: string, args?: unknown) => Promise<unknown>;
        };
      }
    ).__TAURI_INTERNALS__?.invoke;

    if (invoke === undefined) {
      return {
        ok: false,
        message: "Tauri invoke mock was not initialized",
      };
    }

    try {
      await invoke("linkgo_auth_api_key", {
        input: {
          providerKey: "custom",
          apiKey: "sk-test-custom-key",
        },
      });
      return { ok: true, message: "" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  expect(result).toEqual({
    ok: false,
    message: "Custom provider requires a Base URL override",
  });
});

test("starts LinkedIn OAuth manual code flow and disconnects", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  const linkedinCard = page
    .getByText("LinkedIn", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await linkedinCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "LinkedIn connection" });
  await dialog.getByRole("button", { name: "Continue with OAuth" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Couldn't open your browser. Copy the authorization URL instead.",
  );
  await expect(
    dialog.getByRole("button", { name: "Copy authorization URL" }),
  ).toBeVisible();
  await dialog.getByLabel("Authorization code").fill("manual-code");
  await dialog.getByRole("button", { name: "Submit code" }).click();

  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("Disconnected").first()).toBeVisible();
});

test("shows a failed-copy message when OAuth URL copy is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    document.queryCommandSupported = () => false;
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  const linkedinCard = page
    .getByText("LinkedIn", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await linkedinCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "LinkedIn connection" });
  await dialog.getByRole("button", { name: "Continue with OAuth" }).click();
  await dialog.getByRole("button", { name: "Copy authorization URL" }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    "Could not copy automatically. Open the authorization URL and copy it from your browser address bar.",
  );
});

test("rejects plain-HTTP public Base URL even with local consent", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();

  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("test-key-00000000");
  await dialog
    .getByLabel("Base URL override (required)")
    .fill("http://api.example.com/v1");
  const consent = dialog.getByLabel(
    "Allow this local/private endpoint (this computer or network only)",
  );
  await expect(consent).toBeVisible();
  await consent.check();
  await dialog.getByRole("button", { name: "Save API key" }).click();

  await expect(
    page.getByText(
      "Base URL must use https:// unless it is an allowed local endpoint",
    ),
  ).toBeVisible();
  await expect(dialog.getByLabel("Provider API key")).toHaveValue(
    "test-key-00000000",
  );
  await expect(page.getByText("Provider connected")).toBeHidden();
});

test("requires explicit consent before saving a localhost Base URL", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();

  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("test-key-00000000");
  const baseUrl = dialog.getByLabel("Base URL override (required)");
  const consent = dialog.getByLabel(
    "Allow this local/private endpoint (this computer or network only)",
  );

  await baseUrl.fill("https://custom.example.com/v1");
  await expect(consent).toBeHidden();

  await baseUrl.fill("http://localhost:11434/v1");
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(
    page.getByText(/allow the local endpoint to use it/).first(),
  ).toBeVisible();

  await consent.check();
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Provider connected")).toBeVisible();
});

test("shows reauth status and a reconnect path for a disallowed saved Base URL", async ({
  page,
}) => {
  const reauthMessage =
    "Base URL points to this computer or a private network. Reconnect the provider and allow the local endpoint to use it";
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("test-key-00000000");
  await dialog
    .getByLabel("Base URL override (required)")
    .fill("https://custom.example.com/v1");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Provider connected")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.evaluate((message) => {
    (
      window as unknown as {
        __LINKGO_AUTH_REQUIRE_REAUTH__: (key: string, error: string) => void;
      }
    ).__LINKGO_AUTH_REQUIRE_REAUTH__("custom", message);
  }, reauthMessage);
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(customCard.getByText("Reauth required")).toBeVisible();
  await expect(customCard.getByText(reauthMessage)).toBeVisible();
  await customCard.getByRole("button", { name: "Connect" }).click();
  await expect(dialog.getByLabel("Provider API key")).toBeVisible();
});

test("offers local consent when the native policy flags a Base URL the renderer hint missed", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  const customCard = page
    .getByText("Custom API", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await customCard.getByRole("button", { name: "Connect" }).click();

  const dialog = page.getByRole("dialog", { name: "Custom API connection" });
  await dialog.getByLabel("Provider API key").fill("test-key-00000000");
  await dialog
    .getByLabel("Base URL override (required)")
    .fill("https://198.18.0.1/v1");
  const consent = dialog.getByLabel(
    "Allow this local/private endpoint (this computer or network only)",
  );
  await expect(consent).toBeHidden();

  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(
    page.getByText(/allow the local endpoint to use it/).first(),
  ).toBeVisible();
  await expect(consent).toBeVisible();
  await expect(consent).not.toBeChecked();

  await consent.check();
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Provider connected")).toBeVisible();
});

function aiCard(
  page: import("@playwright/test").Page,
  label: "OpenAI" | "Anthropic",
): import("@playwright/test").Locator {
  return page
    .getByText(label, { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
}

async function openAccountSignIn(
  page: import("@playwright/test").Page,
  label: "OpenAI" | "Anthropic",
): Promise<import("@playwright/test").Locator> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();
  await aiCard(page, label).getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: `${label} connection` });
  await dialog.getByRole("button", { name: "Account sign-in" }).click();
  return dialog;
}

async function aiOAuthCalls(
  page: import("@playwright/test").Page,
): Promise<{ cmd: string; input: Record<string, unknown> }[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __LINKGO_AI_OAUTH_CALLS__: {
            cmd: string;
            input: Record<string, unknown>;
          }[];
        }
      ).__LINKGO_AI_OAUTH_CALLS__,
  );
}

for (const label of ["OpenAI", "Anthropic"] as const) {
  test(`${label} account sign-in stays locked until the risk is acknowledged`, async ({
    page,
  }) => {
    const dialog = await openAccountSignIn(page, label);
    const start = dialog.getByRole("button", {
      name: `Sign in with ${label} account`,
    });
    await expect(dialog.getByText(/terms|third-party/i).first()).toBeVisible();
    await expect(start).toBeDisabled();
    expect(await aiOAuthCalls(page)).toEqual([]);

    await dialog.getByLabel(/I understand the risk/).check();
    await expect(start).toBeEnabled();
  });
}

test("Anthropic paste flow connects and signs out without showing tokens", async ({
  page,
}) => {
  const dialog = await openAccountSignIn(page, "Anthropic");
  await dialog.getByLabel(/I understand the risk/).check();
  await dialog
    .getByRole("button", { name: "Sign in with Anthropic account" })
    .click();

  // The WebView cannot follow external links, so native code opens the
  // browser and the UI only reports it, with no dead link left behind.
  await expect(
    dialog.getByText("Opened the Anthropic sign-in page in your browser.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(dialog.locator('a[target="_blank"]')).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Copy sign-in link" }),
  ).toBeVisible();
  await expect(dialog.getByText("Waiting for the browser")).toBeHidden();
  await dialog.getByLabel("Sign-in code").fill("pasted-code#ai-state");
  await dialog.getByRole("button", { name: "Finish sign-in" }).click();

  const calls = await aiOAuthCalls(page);
  expect(calls[0]).toEqual({
    cmd: "linkgo_auth_oauth_start",
    input: { providerKey: "anthropic", acknowledgeTermsRisk: true },
  });
  expect(calls[1]?.input).toMatchObject({
    providerKey: "anthropic",
    code: "pasted-code#ai-state",
    state: "ai-state",
  });

  await expect(
    dialog.getByText("Signed in with Anthropic account"),
  ).toBeVisible();
  await expect(aiCard(page, "Anthropic").getByText("Connected")).toBeVisible();
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(
    aiCard(page, "Anthropic").getByText("Disconnected"),
  ).toBeVisible();
});

test("OpenAI loopback completion event marks the account connected", async ({
  page,
}) => {
  const dialog = await openAccountSignIn(page, "OpenAI");
  await dialog.getByLabel(/I understand the risk/).check();
  await dialog
    .getByRole("button", { name: "Sign in with OpenAI account" })
    .click();
  await expect(
    dialog.getByText("Waiting for the browser to finish sign-in…"),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Or paste the callback address"),
  ).toBeVisible();

  await page.evaluate(() =>
    (
      window as unknown as { __LINKGO_AUTH_LOOPBACK_DONE__: () => void }
    ).__LINKGO_AUTH_LOOPBACK_DONE__(),
  );

  await expect(aiCard(page, "OpenAI").getByText("Connected")).toBeVisible();
  await expect(
    dialog.getByText("Waiting for the browser to finish sign-in…"),
  ).toBeHidden();
  await expect(dialog.getByText("Signed in with OpenAI account")).toBeVisible();
});

test("cancelling OpenAI sign-in stops waiting and tells native code", async ({
  page,
}) => {
  const dialog = await openAccountSignIn(page, "OpenAI");
  await dialog.getByLabel(/I understand the risk/).check();
  await dialog
    .getByRole("button", { name: "Sign in with OpenAI account" })
    .click();
  await dialog.getByRole("button", { name: "Cancel sign-in" }).click();

  await expect(
    dialog.getByText("Waiting for the browser to finish sign-in…"),
  ).toBeHidden();
  await expect(
    dialog.getByRole("button", { name: "Sign in with OpenAI account" }),
  ).toBeVisible();
  const calls = await aiOAuthCalls(page);
  expect(calls.at(-1)).toEqual({
    cmd: "linkgo_auth_oauth_cancel",
    input: { providerKey: "openai" },
  });
  await expect(aiCard(page, "OpenAI").getByText("Disconnected")).toBeVisible();
});

test("closing the dialog mid OpenAI sign-in cancels the native flow", async ({
  page,
}) => {
  const dialog = await openAccountSignIn(page, "OpenAI");
  await dialog.getByLabel(/I understand the risk/).check();
  await dialog
    .getByRole("button", { name: "Sign in with OpenAI account" })
    .click();
  await expect(
    dialog.getByText("Waiting for the browser to finish sign-in…"),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await expect
    .poll(async () => (await aiOAuthCalls(page)).at(-1))
    .toEqual({
      cmd: "linkgo_auth_oauth_cancel",
      input: { providerKey: "openai" },
    });
});

test("shows reconnect-needed state for a revoked AI sign-in", async ({
  page,
}) => {
  const dialog = await openAccountSignIn(page, "OpenAI");
  await dialog.getByLabel(/I understand the risk/).check();
  await dialog
    .getByRole("button", { name: "Sign in with OpenAI account" })
    .click();
  await dialog
    .getByLabel("Or paste the callback address")
    .fill("http://localhost:1455/auth/callback?code=c&state=ai-state");
  await dialog.getByRole("button", { name: "Finish sign-in" }).click();
  await expect(aiCard(page, "OpenAI").getByText("Connected")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.evaluate(() =>
    (
      window as unknown as {
        __LINKGO_AUTH_REQUIRE_REAUTH__: (key: string, error: string) => void;
      }
    ).__LINKGO_AUTH_REQUIRE_REAUTH__(
      "openai",
      "Sign-in expired or was revoked; reconnect this provider",
    ),
  );
  await page.getByRole("button", { name: "Refresh" }).click();
  const card = aiCard(page, "OpenAI");
  await expect(card.getByText("Reauth required")).toBeVisible();
  await expect(
    card.getByText("Sign-in expired or was revoked; reconnect this provider"),
  ).toBeVisible();
  await card.getByRole("button", { name: "Connect" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "OpenAI connection" })
      .getByText(/Reconnect needed/),
  ).toBeVisible();
});

test("expired AI sign-in access token shows automatic renewal, not reconnect", async ({
  page,
}) => {
  const dialog = await openAccountSignIn(page, "OpenAI");
  await dialog.getByLabel(/I understand the risk/).check();
  await dialog
    .getByRole("button", { name: "Sign in with OpenAI account" })
    .click();
  await page.evaluate(() =>
    (
      window as unknown as { __LINKGO_AUTH_LOOPBACK_DONE__: () => void }
    ).__LINKGO_AUTH_LOOPBACK_DONE__(),
  );
  await expect(aiCard(page, "OpenAI").getByText("Connected")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.evaluate(() =>
    (
      window as unknown as {
        __LINKGO_AUTH_EXPIRE_SIGN_IN__: (key: string) => void;
      }
    ).__LINKGO_AUTH_EXPIRE_SIGN_IN__("openai"),
  );
  await page.getByRole("button", { name: "Refresh" }).click();
  const card = aiCard(page, "OpenAI");
  await expect(card.getByText("Renews on next run")).toBeVisible();
  await expect(card.getByText(/renews automatically/)).toBeVisible();
  await expect(card.getByText(/reconnect/i)).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Connect" })).toHaveCount(0);

  await card.getByRole("button", { name: "Manage" }).click();
  const manage = page.getByRole("dialog", { name: "OpenAI connection" });
  await expect(
    manage.getByText(/access renews automatically on the next agent run/),
  ).toBeVisible();
  await expect(manage.getByText(/Reconnect needed/)).toHaveCount(0);
});

test("confirms before sign-in replaces a saved API key and vice versa", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();
  await aiCard(page, "OpenAI").getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "OpenAI connection" });

  // API-key flow is unchanged and is the default method.
  await dialog.getByLabel("OpenAI API key").fill("[REDACTED]");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(aiCard(page, "OpenAI").getByText("Connected")).toBeVisible();
  await expect(page.getByText("[REDACTED]")).toBeHidden();

  await dialog.getByRole("button", { name: "Account sign-in" }).click();
  await dialog.getByLabel(/I understand the risk/).check();
  await dialog
    .getByRole("button", { name: "Sign in with OpenAI account" })
    .click();
  await expect(
    dialog.getByText(/Signing in replaces the saved OpenAI API key/),
  ).toBeVisible();
  expect(await aiOAuthCalls(page)).toEqual([]);
  await dialog
    .getByRole("button", { name: "Replace API key and sign in" })
    .click();
  await expect(
    dialog.getByText("Waiting for the browser to finish sign-in…"),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { __LINKGO_AUTH_LOOPBACK_DONE__: () => void }
    ).__LINKGO_AUTH_LOOPBACK_DONE__(),
  );
  await expect(dialog.getByText("Signed in with OpenAI account")).toBeVisible();

  await dialog.getByRole("button", { name: "API key", exact: true }).click();
  await dialog.getByLabel("OpenAI API key").fill("[REDACTED]");
  await dialog.getByRole("button", { name: "Save API key" }).click();
  await expect(
    dialog.getByText(/Saving a key signs you out of your OpenAI account/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Replace sign-in with API key" })
    .click();
  await expect(dialog.getByText("Signed in with OpenAI account")).toBeHidden();
  await expect(aiCard(page, "OpenAI").getByText("Connected")).toBeVisible();
});
