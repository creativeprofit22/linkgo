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
  await expect(dialog.getByText("Open authorization URL")).toBeVisible();
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
