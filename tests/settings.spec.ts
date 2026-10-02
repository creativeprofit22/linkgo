import { expect, test, type Page } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

async function openSettings(page: Page): Promise<void> {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
}

async function getAppSettings(page: Page): Promise<{
  launch_on_login_enabled: number;
  launch_on_login_last_error: string;
}> {
  return page.evaluate(() => {
    const target = window as unknown as {
      __LINKGO_SQL_APP_SETTINGS__: () => {
        launch_on_login_enabled: number;
        launch_on_login_last_error: string;
      };
    };
    return target.__LINKGO_SQL_APP_SETTINGS__();
  });
}

test("settings page renders launch-on-login state", async ({ page }) => {
  await openSettings(page);

  await expect(page.getByText("Startup", { exact: true })).toBeVisible();
  await expect(page.getByText("Open Linkgo when I sign in")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Open Linkgo when I sign in" }),
  ).toBeVisible();
  await expect(page.getByText("Status: Off")).toBeVisible();
});

test("launch-on-login toggle enables and persists OS-backed state", async ({
  page,
}) => {
  await openSettings(page);

  await page
    .getByRole("switch", { name: "Open Linkgo when I sign in" })
    .click();
  await expect(page.getByText("Status: On")).toBeVisible();

  await openSettings(page);
  await expect(page.getByText("Status: On")).toBeVisible();
});

test("launch-on-login toggle reports OS-backed state when enable does not stick", async ({
  page,
}) => {
  await openSettings(page);
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_AUTOSTART_IS_ENABLED_OVERRIDE__ = false;
  });

  await page
    .getByRole("switch", { name: "Open Linkgo when I sign in" })
    .click();
  await expect(page.getByText("Status: Off")).toBeVisible();
  await expect(
    page.getByText("Your computer kept a different startup setting"),
  ).toBeVisible();
  await expect(
    page.getByText("Linkgo won't open when you sign in."),
  ).toBeVisible();
  await expect(page.getByText("Linkgo will open when you sign in")).toHaveCount(
    0,
  );

  const row = await getAppSettings(page);
  expect(row.launch_on_login_enabled).toBe(0);
});

test("launch-on-login disable updates OS and local settings row", async ({
  page,
}) => {
  await openSettings(page);

  const toggle = page.getByRole("switch", {
    name: "Open Linkgo when I sign in",
  });
  await toggle.click();
  await expect(page.getByText("Status: On")).toBeVisible();
  await toggle.click();
  await expect(page.getByText("Status: Off")).toBeVisible();

  const row = await getAppSettings(page);
  expect(row.launch_on_login_enabled).toBe(0);
});

test("launch-on-login failure keeps previous state and shows error", async ({
  page,
}) => {
  await openSettings(page);
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_FAIL_AUTOSTART_ENABLE__ = true;
  });

  await page
    .getByRole("switch", { name: "Open Linkgo when I sign in" })
    .click();
  await expect(page.getByText("Status: Off")).toBeVisible();
  await expect(
    page.getByText("Last problem: Autostart enable failed"),
  ).toBeVisible();

  const row = await getAppSettings(page);
  expect(row.launch_on_login_enabled).toBe(0);
  expect(row.launch_on_login_last_error).toContain("Autostart enable failed");
});

test("launch-on-login sync-read failure stores audit error and keeps safe state", async ({
  page,
}) => {
  await openSettings(page);
  await page.evaluate(() => {
    (
      window as unknown as Record<string, unknown>
    ).__LINKGO_FAIL_AUTOSTART_IS_ENABLED_AFTER_MUTATION__ = true;
  });

  await page
    .getByRole("switch", { name: "Open Linkgo when I sign in" })
    .click();
  await expect(page.getByText("Status: Off")).toBeVisible();
  await expect(
    page.getByText("Last problem: Autostart status read failed"),
  ).toBeVisible();

  const row = await getAppSettings(page);
  expect(row.launch_on_login_enabled).toBe(0);
  expect(row.launch_on_login_last_error).toContain(
    "Autostart status read failed",
  );
});
