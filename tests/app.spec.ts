import { expect, test } from "@playwright/test";
import {
  expectCurrentScreen,
  openSection,
  sectionButton,
} from "./helpers/navigation";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("app root renders campaigns by default", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveTitle("Linkgo");
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();
  await expectCurrentScreen(page, "campaigns");
  // A fresh start shows the setup checklist instead of the empty card.
  await expect(
    page.getByRole("region", { name: "Get started with Linkgo" }),
  ).toBeVisible();
  await expect(page.getByText("0 of 4 done")).toBeVisible();
});

test("a render crash shows a recovery screen instead of a blank window", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as { __LINKGO_FORCE_RENDER_CRASH__?: boolean }
    ).__LINKGO_FORCE_RENDER_CRASH__ = true;
  });
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });

  const alert = page.getByRole("alert");
  await expect(
    alert.getByRole("heading", { name: "Something went wrong" }),
  ).toBeVisible();
  await expect(alert.getByRole("button", { name: "Reload" })).toBeVisible();
});

test("sidebar sections scroll vertically when the window is short", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  // Settings has the longest section list, nested under its area.
  await page.goto("/#/settings", { waitUntil: "domcontentloaded" });

  const nav = page.getByRole("navigation", { name: "Main menu" });
  const metrics = await nav.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.overflowY).toBe("auto");

  await nav.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  // The last sub-view in the sidebar is reachable once scrolled.
  const tasks = sectionButton(page, "Settings", "Tasks");
  await expect(tasks).toBeInViewport();
  await tasks.click();
  await expect(tasks).toHaveAttribute("aria-current", "page");
});

test("renderer shell does not load GG AI provider code", async ({ page }) => {
  await page.goto("/#/campaigns", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Campaigns", exact: true }),
  ).toBeVisible();

  const scriptTexts = await page.evaluate(async () => {
    const scriptUrls = Array.from(document.scripts)
      .map((script) => script.src)
      .filter((src) => src.length > 0);
    return Promise.all(
      scriptUrls.map(async (src) => {
        const response = await fetch(src);
        return `${src}\n${await response.text()}`;
      }),
    );
  });
  const rendererBundle = scriptTexts.join("\n");

  expect(rendererBundle).not.toContain("@kenkaiiii/gg-ai");
  expect(rendererBundle).not.toContain("@kenkaiiii_gg-ai");
});

test("autopilot, backlog, queue, drafts, approvals, metrics, workflows, and agent runtime render real views", async ({
  page,
}) => {
  await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });

  await openSection(page, "Settings", "Autopilot");
  await expect(
    page.getByRole("heading", { name: "Autopilot", exact: true }),
  ).toBeVisible();
  await expectCurrentScreen(page, "autopilot");

  await openSection(page, "Settings", "Tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  await openSection(page, "Create", "Ideas");
  await expect(
    page.getByRole("heading", { name: "Ideas", exact: true }),
  ).toBeVisible();

  await openSection(page, "Create", "Drafts");
  await expect(
    page.getByRole("heading", { name: "Drafts", exact: true }),
  ).toBeVisible();

  await openSection(page, "Create", "Approvals");
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
  await expectCurrentScreen(page, "approvals");

  await openSection(page, "Results");
  await expect(
    page.getByRole("heading", { name: "Analytics", exact: true }),
  ).toBeVisible();
  await expectCurrentScreen(page, "metrics");

  await openSection(page, "Settings", "Automations");
  await expect(
    page.getByRole("heading", { name: "Automations", exact: true }),
  ).toBeVisible();
  await expectCurrentScreen(page, "workflows");

  await openSection(page, "Settings", "AI assistant");
  await expect(
    page.getByRole("heading", { name: "AI assistant", exact: true }),
  ).toBeVisible();
  await expectCurrentScreen(page, "agents");
});
