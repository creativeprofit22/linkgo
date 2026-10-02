import { expect, test, type Page } from "@playwright/test";

/**
 * These specs deliberately skip `setupTauriMocks`: the page has no Tauri
 * runtime, exactly like opening the Vite build in a normal browser.
 */

const PREVIEW_BANNER_TEXT =
  "You're looking at a preview in your browser, so nothing is saved. Open the Linkgo app to work with your real data.";
const DESKTOP_REQUIRED_TEXT =
  "This only works in the Linkgo app. Nothing is saved in this browser preview.";

async function expectPreviewBanner(page: Page): Promise<void> {
  const banner = page
    .getByRole("status")
    .filter({ hasText: PREVIEW_BANNER_TEXT });
  await expect(banner).toBeVisible();
}

test("browser preview identifies itself as a nonpersistent preview", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expectPreviewBanner(page);
});

test("approvals explain the desktop requirement instead of a runtime TypeError", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Approvals/ }).click();
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();

  await expect(
    page.getByRole("alert").filter({ hasText: DESKTOP_REQUIRED_TEXT }),
  ).toBeVisible();
  await expect(page.getByText(/TypeError|undefined/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
});

test("settings disables launch-on-login in the browser preview", async ({
  page,
}) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expectPreviewBanner(page);

  const toggle = page.getByRole("switch", {
    name: "Open Linkgo when I sign in",
  });
  await expect(toggle).toBeDisabled();
  await expect(page.getByText(DESKTOP_REQUIRED_TEXT)).toBeVisible();
});

test("scheduler controls explain the desktop requirement and never fake success", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Auto-posting/ }).click();
  await expect(
    page.getByRole("heading", { name: "Auto-posting", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(DESKTOP_REQUIRED_TEXT).first()).toBeVisible();

  await page.getByRole("button", { name: "Turn on auto-posting" }).click();
  await expect(
    page.getByText("We couldn't turn on auto-posting"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Post what's due now" }).click();
  await expect(page.getByText("We couldn't check for due posts")).toBeVisible();

  await expect(page.getByText("Auto-posting is on")).toHaveCount(0);
  await expect(page.getByText("Checked for due posts")).toHaveCount(0);
  await expect(page.getByText("Running", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/require(s)? the Tauri/)).toHaveCount(0);

  const results = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        __LINKGO_SCHEDULER_TEST_API__: Record<string, () => Promise<unknown>>;
      }
    ).__LINKGO_SCHEDULER_TEST_API__;
    const names = [
      "getSchedulerStatus",
      "startScheduler",
      "stopScheduler",
      "runSchedulerTick",
    ];
    return Promise.all(
      names.map(async (name) => {
        try {
          await api[name]?.();
          return { name, ok: true, errorName: "", message: "" };
        } catch (error) {
          const caught = error as Error;
          return {
            name,
            ok: false,
            errorName: caught.name,
            message: caught.message,
          };
        }
      }),
    );
  });
  for (const result of results) {
    expect(result.ok, result.name).toBe(false);
    expect(result.errorName, result.name).toBe("DesktopRequiredError");
    expect(result.message, result.name).toContain(DESKTOP_REQUIRED_TEXT);
  }
});

test("integrations disable credential changes and never report fake success", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Connected accounts/ }).click();
  await expect(
    page.getByRole("heading", { name: "Connected accounts", exact: true }),
  ).toBeVisible();

  const connectButtons = page.getByRole("button", {
    name: /^(Connect|Manage)$/,
  });
  await expect(connectButtons.first()).toBeVisible();
  for (const button of await connectButtons.all()) {
    await expect(button).toBeDisabled();
  }
  await expect(page.getByText(DESKTOP_REQUIRED_TEXT)).toBeVisible();

  const result = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        __LINKGO_INTEGRATIONS_TEST_API__: {
          saveApiKey: (input: {
            providerKey: string;
            apiKey: string;
          }) => Promise<unknown>;
        };
      }
    ).__LINKGO_INTEGRATIONS_TEST_API__;
    try {
      await api.saveApiKey({
        providerKey: "openai",
        apiKey: "sk-preview-12345678",
      });
      return { ok: true, name: "", message: "" };
    } catch (error) {
      const caught = error as Error;
      return { ok: false, name: caught.name, message: caught.message };
    }
  });
  expect(result.ok).toBe(false);
  expect(result.name).toBe("DesktopRequiredError");
  await expect(page.getByText("Account connected")).toHaveCount(0);
});
