import { expect, test } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("connects API-key provider without rendering secrets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
  await expect(page.getByText("OpenAI", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Connect" }).first().click();

  const dialog = page.getByRole("dialog", { name: "OpenAI connection" });
  await dialog.getByLabel("OpenAI API key").fill("sk-test-secret-key");
  await dialog.getByLabel("Account label").fill("Test OpenAI");
  await dialog.getByRole("button", { name: "Save API key" }).click();

  await expect(page.getByText("Connected").first()).toBeVisible();
  await expect(page.getByText("sk-test-secret-key")).toBeHidden();
});

test("starts LinkedIn OAuth manual code flow and disconnects", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Integrations/ }).click();

  const linkedinCard = page
    .getByText("LinkedIn", { exact: true })
    .locator("xpath=ancestor::div[contains(@class, 'bg-card')][1]");
  await linkedinCard.getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "LinkedIn connection" });
  await dialog.getByRole("button", { name: "Continue with OAuth" }).click();
  await expect(dialog.getByText("Open authorization URL")).toBeVisible();
  await dialog.getByLabel("Authorization code").fill("manual-code");
  await dialog.getByRole("button", { name: "Submit code" }).click();

  await expect(page.getByText("Connected").first()).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("Disconnected").first()).toBeVisible();
});
