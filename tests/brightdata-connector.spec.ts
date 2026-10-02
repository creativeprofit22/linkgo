import { expect, test, type Locator, type Page } from "@playwright/test";

import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

type MockState = {
  enabled: boolean;
  killSwitchActive: boolean;
  watchlistLeavesRunning: boolean;
  calls: string[];
  runs: Array<{ status: string; mode: string }>;
};

async function mockState(page: Page): Promise<MockState> {
  return page.evaluate(
    () =>
      JSON.parse(
        JSON.stringify(
          (window as unknown as { __LINKGO_BRIGHTDATA__: unknown })
            .__LINKGO_BRIGHTDATA__,
        ),
      ) as MockState,
  );
}

async function setMock(
  page: Page,
  patch: Partial<
    Pick<MockState, "killSwitchActive" | "watchlistLeavesRunning">
  >,
): Promise<void> {
  await page.evaluate((values) => {
    Object.assign(
      (window as unknown as { __LINKGO_BRIGHTDATA__: object })
        .__LINKGO_BRIGHTDATA__,
      values,
    );
  }, patch);
}

async function openPanel(page: Page): Promise<Locator> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New campaign" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByLabel("Name").fill("Bright Data campaign");
  await dialog.getByLabel("Product").fill("Local LinkedIn operations");
  await dialog.getByLabel("Audience").fill("Operators");
  await dialog.getByLabel("Voice").fill("Concrete");
  await dialog.getByLabel("Tone").fill("Practical");
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: /^Ideas/ }).click();
  const panel = page.getByTestId("brightdata-panel");
  await expect(
    panel.getByRole("switch", { name: "Fetch posts with Bright Data" }),
  ).toBeVisible();
  return panel;
}

test("connector is off by default and shows no run controls", async ({
  page,
}) => {
  const panel = await openPanel(page);
  const toggle = panel.getByRole("switch", {
    name: "Fetch posts with Bright Data",
  });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(panel.getByText(/waiting for owner sign-off/)).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Fetch posts" })).toHaveCount(
    0,
  );
  const state = await mockState(page);
  expect(state.enabled).toBe(false);
  expect(state.calls).not.toContain("linkgo_brightdata_start_run");
  expect(state.calls).not.toContain("linkgo_brightdata_set_enabled");
});

test("a build pending review sign-off warns to keep the connector off", async ({
  page,
}) => {
  // Runs after the mock init script, so the status starts pending.
  await page.addInitScript(() => {
    (
      window as unknown as {
        __LINKGO_BRIGHTDATA__: { reviewStatus: string };
      }
    ).__LINKGO_BRIGHTDATA__.reviewStatus = "pending_sign_off";
  });
  const panel = await openPanel(page);
  await expect(panel.getByText(/waiting for owner sign-off/)).toBeVisible();
});

test("turning the connector on lets a post URL run import", async ({
  page,
}) => {
  const panel = await openPanel(page);
  await panel
    .getByRole("switch", { name: "Fetch posts with Bright Data" })
    .click();
  await expect(
    panel.getByRole("switch", { name: "Fetch posts with Bright Data" }),
  ).toHaveAttribute("aria-checked", "true");

  await panel
    .getByLabel(/LinkedIn post links/)
    .fill(
      "https://www.linkedin.com/posts/a_1-activity-1\nhttps://www.linkedin.com/posts/b_2-activity-2",
    );
  // Keyword search was retired upstream and is not offered.
  await expect(panel.getByLabel("Source").locator("option")).toHaveText([
    "Post links",
    "Watchlist",
  ]);
  await panel.getByRole("button", { name: "Fetch posts" }).click();

  const run = panel.getByTestId("brightdata-run").first();
  await expect(run.getByText("Imported", { exact: true })).toBeVisible();
  await expect(run.getByText("2 posts")).toBeVisible();
  await expect(panel.getByText("1 of 5 fetches used today")).toBeVisible();
});

test("form validation and the kill switch block runs", async ({ page }) => {
  const panel = await openPanel(page);
  await panel
    .getByRole("switch", { name: "Fetch posts with Bright Data" })
    .click();
  await panel.getByRole("button", { name: "Fetch posts" }).click();
  await expect(panel.getByRole("alert")).toHaveText(
    "Add at least one LinkedIn post link",
  );

  await setMock(page, { killSwitchActive: true });
  await panel
    .getByRole("switch", { name: "Fetch posts with Bright Data" })
    .click();
  await panel
    .getByRole("switch", { name: "Fetch posts with Bright Data" })
    .click();
  await expect(
    panel.getByText("Pause everything is on, so fetching is paused."),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Fetch posts" }),
  ).toBeDisabled();
  expect((await mockState(page)).calls).not.toContain(
    "linkgo_brightdata_start_run",
  );
});

test("watchlist entries can be added, rejected, paused, and removed", async ({
  page,
}) => {
  const panel = await openPanel(page);
  await panel
    .getByRole("switch", { name: "Fetch posts with Bright Data" })
    .click();

  await panel
    .getByLabel("LinkedIn link")
    .fill("https://www.linkedin.com/company/acme");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByText(
      "Use a LinkedIn profile URL like https://www.linkedin.com/in/name",
    ),
  ).toBeVisible();

  await panel
    .getByLabel("LinkedIn link")
    .fill("https://www.linkedin.com/in/ada");
  await panel.getByLabel("Label (optional)").fill("Ada");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    panel.getByText("https://www.linkedin.com/in/ada"),
  ).toBeVisible();
  await expect(panel.getByLabel("LinkedIn link")).toHaveValue("");

  const include = panel.getByRole("switch", {
    name: "Include Ada when fetching from the watchlist",
  });
  await include.click();
  await expect(include).toHaveAttribute("aria-checked", "false");

  await panel.getByRole("button", { name: "Remove Ada" }).click();
  await expect(panel.getByText("No profiles or companies yet.")).toBeVisible();
});

test("a watchlist run left collecting can be resumed", async ({ page }) => {
  const panel = await openPanel(page);
  await panel
    .getByRole("switch", { name: "Fetch posts with Bright Data" })
    .click();
  await panel
    .getByLabel("LinkedIn link")
    .fill("https://www.linkedin.com/in/ada");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    panel.getByText("https://www.linkedin.com/in/ada"),
  ).toBeVisible();

  await setMock(page, { watchlistLeavesRunning: true });
  await panel.getByLabel("Source").selectOption("watchlist");
  await panel.getByRole("button", { name: "Fetch posts" }).click();

  const run = panel.getByTestId("brightdata-run").first();
  await expect(run.getByText("Collecting", { exact: true })).toBeVisible();
  await run.getByRole("button", { name: "Continue" }).click();
  await expect(run.getByText("Imported", { exact: true })).toBeVisible();
  await expect(run.getByRole("button", { name: "Continue" })).toHaveCount(0);
});

test("an active run can be cancelled", async ({ page }) => {
  const panel = await openPanel(page);
  await panel
    .getByRole("switch", { name: "Fetch posts with Bright Data" })
    .click();
  await panel
    .getByLabel("LinkedIn link")
    .fill("https://www.linkedin.com/in/ada");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await setMock(page, { watchlistLeavesRunning: true });
  await panel.getByLabel("Source").selectOption("watchlist");
  await panel.getByRole("button", { name: "Fetch posts" }).click();

  const run = panel.getByTestId("brightdata-run").first();
  await run.getByRole("button", { name: "Cancel" }).click();
  await expect(run.getByText("Cancelled", { exact: true })).toBeVisible();
});
