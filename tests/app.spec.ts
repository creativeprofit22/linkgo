import { expect, test } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("app root renders campaigns by default", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Linkgo");
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Campaigns/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("No campaigns yet")).toBeVisible();
});

test("queue and drafts render real views", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Drafts/ }).click();
  await expect(
    page.getByRole("heading", { name: "Drafts", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Drafts/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
