import { expect, test } from "@playwright/test";
import { setupTauriMocks } from "./helpers/tauri-mocks";

test.beforeEach(async ({ page }) => {
  await setupTauriMocks(page);
});

test("app root renders campaigns by default", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

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

test("sidebar sections scroll vertically when the window is short", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const nav = page.getByRole("navigation", { name: "Linkgo sections" });
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
  const safety = nav.getByRole("button", { name: /^Safety/ });
  await expect(safety).toBeInViewport();
  await safety.click();
  await expect(safety).toHaveAttribute("aria-current", "page");
});

test("renderer shell does not load GG AI provider code", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
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
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: /Autopilot/ }).click();
  await expect(
    page.getByRole("heading", { name: "Autopilot", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Autopilot/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("button", { name: /Backlog/ }).click();
  await expect(
    page.getByRole("heading", { name: "Campaign Backlog" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Queue/ }).click();
  await expect(
    page.getByRole("heading", { name: "Candidate Queue" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Drafts/ }).click();
  await expect(
    page.getByRole("heading", { name: "Drafts", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Approvals/ }).click();
  await expect(
    page.getByRole("heading", { name: "Approvals", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Approvals/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("button", { name: /Metrics/ }).click();
  await expect(
    page.getByRole("heading", { name: "Metrics", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Metrics/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("button", { name: /Workflows/ }).click();
  await expect(
    page.getByRole("heading", { name: "Workflows", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Workflows/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("button", { name: /Agent Runtime/ }).click();
  await expect(
    page.getByRole("heading", { name: "Agent Runtime", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Agent Runtime/ }),
  ).toHaveAttribute("aria-current", "page");
});
