import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";

import { approvalsRoute } from "../src/features/approvals/schemas";
import { contentCalendarRoute } from "../src/features/content-calendar/schemas";
import { draftsRoute } from "../src/features/drafts/schemas";
import { metricsRoute } from "../src/features/metrics/schemas";
import { safetyRoute } from "../src/features/safety/schemas";
import { todayRoute } from "../src/features/today/schemas";
import {
  defineRoute,
  emptyRouteSearch,
  formatRouteHash,
  parseRouteHash,
  splitRouteHash,
} from "../src/lib/navigation/route-contract";
import { homeAreas, homeRoutes } from "../src/pages/home-areas";
import {
  areaButton,
  areaLabels,
  expectCurrentScreen,
  mainMenu,
  openScreen,
  screenMenu,
  sectionButton,
  sectionsNav,
  type MenuScreenId,
} from "./helpers/navigation";
import { setupTauriMocks } from "./helpers/tauri-mocks";

const listRoute = defineRoute("list", emptyRouteSearch());
const detailRoute = defineRoute(
  "detail",
  z.object({
    itemId: z.coerce.number().int().positive().optional(),
    tab: z.enum(["a", "b"]).optional(),
  }),
);
const routes = [listRoute, detailRoute];

test.describe("route contract", () => {
  test("formats links with sorted keys and omits empty values", () => {
    expect(formatRouteHash(listRoute)).toBe("#/list");
    expect(formatRouteHash(detailRoute, { tab: "b", itemId: 7 })).toBe(
      "#/detail?itemId=7&tab=b",
    );
    expect(formatRouteHash(detailRoute, { itemId: undefined })).toBe(
      "#/detail",
    );
  });

  test("round-trips typed params through a link", () => {
    const hash = formatRouteHash(detailRoute, { itemId: 42, tab: "a" });
    expect(parseRouteHash(hash, routes, "list")).toEqual({
      kind: "ok",
      routeId: "detail",
      params: { itemId: 42, tab: "a" },
    });
  });

  test("falls back to the default screen for unknown or empty ids", () => {
    expect(parseRouteHash("#/nope?x=1", routes, "list")).toEqual({
      kind: "unknown-screen",
      routeId: "list",
      requestedId: "nope",
    });
    expect(parseRouteHash("#/%E0%A4%A", routes, "list").kind).toBe(
      "unknown-screen",
    );
    expect(splitRouteHash("").id).toBe("");
    expect(splitRouteHash("#/").id).toBe("");
  });

  test("reports invalid params instead of throwing", () => {
    for (const hash of [
      "#/detail?itemId=abc",
      "#/detail?itemId=-3",
      "#/detail?itemId=1.5",
      "#/detail?itemId=0",
      "#/detail?tab=zzz",
    ]) {
      expect(parseRouteHash(hash, routes, "list"), hash).toEqual({
        kind: "invalid-params",
        routeId: "detail",
        params: {},
      });
    }
  });

  test("drops unknown keys and keeps the first repeated key", () => {
    expect(
      parseRouteHash("#/detail?itemId=5&itemId=9&extra=1", routes, "list"),
    ).toEqual({ kind: "ok", routeId: "detail", params: { itemId: 5 } });
  });

  test("rejects route ids that are not lowercase slugs", () => {
    expect(() => defineRoute("Bad Id", emptyRouteSearch())).toThrow();
  });

  test("validates Drafts link params", () => {
    const parse = (search: Record<string, string>) =>
      draftsRoute.search.safeParse(search);
    expect(parse({ campaignId: "3", candidateId: "12" })).toEqual({
      success: true,
      data: { campaignId: 3, candidateId: 12 },
    });
    expect(parse({}).success).toBe(true);
    expect(parse({ campaignId: "abc" }).success).toBe(false);
    expect(parse({ campaignId: "-1" }).success).toBe(false);
    // An idea filter without its campaign is a broken link.
    expect(parse({ candidateId: "12" }).success).toBe(false);
    expect(
      formatRouteHash(draftsRoute, { campaignId: 3, candidateId: 12 }),
    ).toBe("#/drafts?campaignId=3&candidateId=12");
    expect(formatRouteHash(draftsRoute, { campaignId: 3 })).toBe(
      "#/drafts?campaignId=3",
    );
    expect(formatRouteHash(draftsRoute, {})).toBe("#/drafts");
    // `write=1` opens Write with AI for one idea; it needs both ids.
    expect(parse({ campaignId: "3", candidateId: "12", write: "1" })).toEqual({
      success: true,
      data: { campaignId: 3, candidateId: 12, write: "1" },
    });
    expect(parse({ campaignId: "3", write: "1" }).success).toBe(false);
    expect(
      parse({ campaignId: "3", candidateId: "12", write: "true" }).success,
    ).toBe(false);
    expect(
      formatRouteHash(draftsRoute, {
        campaignId: 3,
        candidateId: 12,
        write: "1",
      }),
    ).toBe("#/drafts?campaignId=3&candidateId=12&write=1");
  });

  test("validates Approvals link params", () => {
    const parse = (search: Record<string, string>) =>
      approvalsRoute.search.safeParse(search);
    expect(parse({}).success).toBe(true);
    expect(parse({ campaignId: "3" })).toEqual({
      success: true,
      data: { campaignId: 3 },
    });
    expect(parse({ campaignId: "3", approvalId: "9" })).toEqual({
      success: true,
      data: { campaignId: 3, approvalId: 9 },
    });
    expect(parse({ campaignId: "3", draftId: "5", send: "1" })).toEqual({
      success: true,
      data: { campaignId: 3, draftId: 5, send: "1" },
    });
    // Ids need their campaign; `send` needs a draft; one target at a time.
    expect(parse({ approvalId: "9" }).success).toBe(false);
    expect(parse({ draftId: "5", send: "1" }).success).toBe(false);
    expect(parse({ campaignId: "3", send: "1" }).success).toBe(false);
    expect(parse({ campaignId: "3", approvalId: "9", send: "1" }).success).toBe(
      false,
    );
    expect(
      parse({ campaignId: "3", approvalId: "9", draftId: "5" }).success,
    ).toBe(false);
    expect(
      formatRouteHash(approvalsRoute, { campaignId: 3, draftId: 5, send: "1" }),
    ).toBe("#/approvals?campaignId=3&draftId=5&send=1");
  });

  test("validates Calendar link params", () => {
    const parse = (search: Record<string, string>) =>
      contentCalendarRoute.search.safeParse(search);
    expect(parse({}).success).toBe(true);
    expect(parse({ campaignId: "3", approvalId: "9" })).toEqual({
      success: true,
      data: { campaignId: 3, approvalId: 9 },
    });
    expect(parse({ approvalId: "9" }).success).toBe(false);
    expect(parse({ campaignId: "3", approvalId: "0" }).success).toBe(false);
    expect(
      formatRouteHash(contentCalendarRoute, { campaignId: 3, approvalId: 9 }),
    ).toBe("#/calendar?approvalId=9&campaignId=3");
  });

  test("validates Metrics link params", () => {
    const parse = (search: Record<string, string>) =>
      metricsRoute.search.safeParse(search);
    expect(parse({}).success).toBe(true);
    expect(parse({ campaignId: "3", approvalId: "9" })).toEqual({
      success: true,
      data: { campaignId: 3, approvalId: 9 },
    });
    // A post needs its campaign.
    expect(parse({ approvalId: "9" }).success).toBe(false);
    expect(parse({ campaignId: "3", approvalId: "x" }).success).toBe(false);
    expect(
      formatRouteHash(metricsRoute, { campaignId: 3, approvalId: 9 }),
    ).toBe("#/metrics?approvalId=9&campaignId=3");
  });

  test("validates Safety and Today link params", () => {
    const parse = (search: Record<string, string>) =>
      safetyRoute.search.safeParse(search);
    expect(parse({}).success).toBe(true);
    expect(parse({ executionId: "41" })).toEqual({
      success: true,
      data: { executionId: 41 },
    });
    expect(parse({ executionId: "0" }).success).toBe(false);
    expect(parse({ executionId: "x" }).success).toBe(false);
    expect(formatRouteHash(safetyRoute, { executionId: 41 })).toBe(
      "#/safety?executionId=41",
    );
    expect(todayRoute.search.safeParse({}).success).toBe(true);
    // Today takes no params; unknown ones are dropped.
    expect(todayRoute.search.safeParse({ x: "1" })).toEqual({
      success: true,
      data: {},
    });
    expect(formatRouteHash(todayRoute, {})).toBe("#/today");
  });

  test("refuses to format links the destination would reject", () => {
    expect(() => formatRouteHash(draftsRoute, { campaignId: 0 })).toThrow(
      /"drafts"/,
    );
    expect(() =>
      formatRouteHash(draftsRoute, { campaignId: 3, candidateId: 1.5 }),
    ).toThrow(/"drafts"/);
    expect(() => formatRouteHash(detailRoute, { itemId: -1 })).toThrow(
      /"detail"/,
    );
  });
});

test.describe("screen links", () => {
  test.beforeEach(async ({ page }) => {
    await setupTauriMocks(page);
  });

  test("every campaign picker is named after its visible label", async ({
    page,
  }) => {
    await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
    await createCampaign(page);
    const pickers = [
      ["queue", "Selected campaign"],
      ["drafts", "Selected campaign"],
      ["comments", "Campaign"],
      ["metrics", "Campaign"],
      ["safety", "Show campaign"],
      ["agents", "Selected campaign"],
    ] as const satisfies readonly (readonly [MenuScreenId, string])[];
    for (const [screen, label] of pickers) {
      await openScreen(page, screen);
      await expect(
        page.getByRole("combobox", { name: label, exact: true }),
        screen,
      ).toBeVisible();
      const scan = await new AxeBuilder({ page })
        .withRules(["select-name"])
        .analyze();
      expect(scan.violations, screen).toEqual([]);
    }
  });

  test("every menu screen has its own address", async ({ page }) => {
    await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/#\/campaigns$/);

    // The Main menu holds exactly the five areas.
    for (const area of areaLabels) {
      await expect(areaButton(page, area), area).toHaveCount(1);
    }
    await expect(
      mainMenu(page).getByRole("button", {
        name: /^(Today|Create|Calendar|Results|Settings)$/,
      }),
    ).toHaveCount(areaLabels.length);

    // Each area's section menu lists exactly its sub-views, so a new menu
    // entry without a row in screenMenu fails instead of going untested.
    for (const id of Object.keys(screenMenu) as MenuScreenId[]) {
      const { area } = screenMenu[id];
      await openScreen(page, id);
      await expect(page, id).toHaveURL(new RegExp(`#/${id}$`));
      await expectCurrentScreen(page, id);
      const sectionCount = Object.values(screenMenu).filter(
        (entry) => entry.area === area,
      ).length;
      if (sectionCount > 1) {
        await expect(sectionsNav(page, area).getByRole("button")).toHaveCount(
          sectionCount,
        );
      } else {
        await expect(sectionsNav(page, area)).toHaveCount(0);
      }
    }

    // A typed address opens its screen directly.
    for (const id of ["workflows", "backlog"] as const) {
      await page.goto(`/#/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`#/${id}$`));
      await expectCurrentScreen(page, id);
      await expect(page.getByTestId("navigation-unknown-screen")).toHaveCount(
        0,
      );
    }

    await openScreen(page, "queue");
    await expect(page).toHaveURL(/#\/queue$/);
    await openScreen(page, "metrics");
    await expect(page).toHaveURL(/#\/metrics$/);

    await page.goBack();
    await expect(page).toHaveURL(/#\/queue$/);
    await expectCurrentScreen(page, "queue");
    await page.goForward();
    await expect(page).toHaveURL(/#\/metrics$/);
  });

  test("opening the screen already showing adds no history entry", async ({
    page,
  }) => {
    const ideas = sectionButton(page, "Create", "Ideas");
    const historyLength = (): Promise<number> =>
      page.evaluate(() => window.history.length);

    // Non-canonical addresses for the same screen: no slash, unknown key.
    for (const address of ["/#queue", "/#/queue?utm=x"]) {
      await page.goto(address, { waitUntil: "domcontentloaded" });
      await expect(ideas, address).toHaveAttribute("aria-current", "page");
      const before = await historyLength();
      await ideas.click();
      await expect(ideas, address).toHaveAttribute("aria-current", "page");
      expect(await historyLength(), address).toBe(before);
    }
  });

  test("Ideas opens Drafts for one idea and Back returns to Ideas", async ({
    page,
  }) => {
    await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
    await createCampaign(page);
    await openScreen(page, "queue");
    await addCandidate(page, "Jane Operator", "123");
    await addCandidate(page, "Sam Builder", "456");

    // Write one draft per idea so the filter has something to hide.
    await openScreen(page, "drafts");
    await createDraftFor(page, "Jane Operator");
    await createDraftFor(page, "Sam Builder");
    await expect(
      page.getByRole("heading", { name: "Sam Builder" }),
    ).toBeVisible();

    await openScreen(page, "queue");
    const janeCard = page
      .locator(".linkgo-card")
      .filter({ has: page.getByText("Jane Operator", { exact: true }) });
    await janeCard
      .getByRole("button", { name: "Open draft", exact: true })
      .click();

    await expect(page).toHaveURL(/#\/drafts\?campaignId=\d+&candidateId=\d+$/);
    await expect(page.getByTestId("drafts-idea-filter")).toContainText(
      "Showing drafts for one idea.",
    );
    await expect(
      page.getByRole("heading", { name: "Jane Operator" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sam Builder" }),
    ).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/#\/queue$/);
    await expectCurrentScreen(page, "queue");

    await page.goForward();
    await expect(page.getByTestId("drafts-idea-filter")).toBeVisible();
    await page.getByRole("button", { name: "Show all drafts" }).click();
    await expect(page).toHaveURL(/#\/drafts\?campaignId=\d+$/);
    await expect(page.getByTestId("drafts-idea-filter")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Sam Builder" }),
    ).toBeVisible();
  });

  test("Back to an idea link while Drafts stays open reselects its campaign", async ({
    page,
  }) => {
    await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
    await createCampaign(page, "Campaign A");
    await createCampaign(page, "Campaign B");

    // The campaign picker is the first select on both Ideas and Drafts.
    const campaignPicker = page.getByRole("combobox").first();
    await openLoadedScreen(page, "Ideas");
    await campaignPicker.selectOption({ label: "Campaign A" });
    await addCandidate(page, "Jane Operator", "123");
    await addCandidate(page, "Sam Builder", "456");
    await campaignPicker.selectOption({ label: "Campaign B" });
    await addCandidate(page, "Bea Other", "789");

    await openLoadedScreen(page, "Drafts");
    await campaignPicker.selectOption({ label: "Campaign A" });
    await expect(page).toHaveURL(/#\/drafts\?campaignId=\d+$/);
    await createDraftFor(page, "Jane Operator");
    await createDraftFor(page, "Sam Builder");
    await campaignPicker.selectOption({ label: "Campaign B" });
    await createDraftFor(page, "Bea Other");
    await expect(
      page.getByRole("heading", { name: "Bea Other" }),
    ).toBeVisible();

    await openLoadedScreen(page, "Ideas");
    await campaignPicker.selectOption({ label: "Campaign A" });
    const janeCard = page
      .locator(".linkgo-card")
      .filter({ has: page.getByText("Jane Operator", { exact: true }) });
    await janeCard
      .getByRole("button", { name: "Open draft", exact: true })
      .click();
    await expect(page.getByTestId("drafts-idea-filter")).toBeVisible();
    const ideaHash = await page.evaluate(() => window.location.hash);
    const match = /^#\/drafts\?campaignId=(\d+)&candidateId=(\d+)$/.exec(
      ideaHash,
    );
    if (match === null) throw new Error(`Unexpected link ${ideaHash}`);
    const campaignAId = match[1] ?? "";

    await page.getByRole("button", { name: "Show all drafts" }).click();
    await expect(page).toHaveURL(
      new RegExp(`#/drafts\\?campaignId=${campaignAId}$`),
    );

    // Switching campaigns replaces the address; Drafts stays mounted.
    await campaignPicker.selectOption({ label: "Campaign B" });
    await expect(page).not.toHaveURL(
      new RegExp(`campaignId=${campaignAId}(&|$)`),
    );
    await expect(
      page.getByRole("heading", { name: "Bea Other" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Jane Operator" }),
    ).toHaveCount(0);

    await page.goBack();
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toBe(ideaHash);
    await expect(campaignPicker).toHaveValue(campaignAId);
    await expect(page.getByTestId("drafts-idea-filter")).toContainText(
      "Showing drafts for one idea.",
    );
    await expect(
      page.getByRole("heading", { name: "Jane Operator" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sam Builder" }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Bea Other" })).toHaveCount(
      0,
    );
  });

  test("a link to an idea that is gone shows all drafts with a message", async ({
    page,
  }) => {
    await page.goto("/#/campaigns", { waitUntil: "domcontentloaded" });
    await createCampaign(page);
    const campaignHash = await page.evaluate(() => {
      window.location.hash = "#/drafts?campaignId=1&candidateId=9999";
      return window.location.hash;
    });
    expect(campaignHash).toContain("candidateId=9999");
    await expect(page.getByTestId("drafts-link-not-found")).toContainText(
      "We couldn’t find what that link pointed to, so here are all drafts.",
    );
    await expect(page.getByText("Selected campaign")).toBeVisible();
  });

  test("bad Drafts params fall back to the list with a message", async ({
    page,
  }) => {
    await page.goto("/#/drafts?campaignId=abc", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Drafts", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("drafts-link-not-found")).toBeVisible();
  });

  test("an unknown screen opens Today with a message", async ({ page }) => {
    await page.goto("/#/nope", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("navigation-unknown-screen")).toHaveText(
      "That link didn’t match a screen, so we opened Today.",
    );
    await expectCurrentScreen(page, "today");

    await openScreen(page, "queue");
    await expect(page.getByTestId("navigation-unknown-screen")).toHaveCount(0);
  });

  test("reopening the app restores the last screen", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openScreen(page, "safety");
    await expect(page).toHaveURL(/#\/safety$/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("linkgo.navigation.last-screen"),
        ),
      )
      .toBe("safety");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/#\/safety$/);
    await expectCurrentScreen(page, "safety");
  });

  test("a stored screen that no longer exists is ignored", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("linkgo.navigation.last-screen", "removed");
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/#\/today$/);
    await expect(page.getByTestId("navigation-unknown-screen")).toHaveCount(0);
  });

  test("every screen link opens with its area and section marked", async ({
    page,
  }) => {
    for (const id of Object.keys(screenMenu) as MenuScreenId[]) {
      await page.goto(`/#/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page, id).toHaveURL(new RegExp(`#/${id}$`));
      await expectCurrentScreen(page, id);
      await expect(page.getByTestId("navigation-unknown-screen")).toHaveCount(
        0,
      );
    }
  });

  test("area links and the retired scheduler link replace to a screen", async ({
    page,
  }) => {
    for (const { alias, id } of [
      { alias: "create", id: "campaigns" },
      { alias: "results", id: "metrics" },
      { alias: "scheduler", id: "calendar" },
    ] as const) {
      await page.goto("/#/today", { waitUntil: "domcontentloaded" });
      await expectCurrentScreen(page, "today");
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, `#/${alias}`);
      await expect(page, alias).toHaveURL(new RegExp(`#/${id}$`));
      await expectCurrentScreen(page, id);
      await expect(page.getByTestId("navigation-unknown-screen")).toHaveCount(
        0,
      );
      // The alias was replaced, so Back skips it.
      await page.goBack();
      await expect(page, alias).toHaveURL(/#\/today$/);
    }
  });

  test("an area reopens the sub-view last used in it", async ({ page }) => {
    await page.goto("/#/drafts", { waitUntil: "domcontentloaded" });
    await areaButton(page, "Results").click();
    await expect(page).toHaveURL(/#\/metrics$/);
    await areaButton(page, "Create").click();
    await expect(page).toHaveURL(/#\/drafts$/);
    await expectCurrentScreen(page, "drafts");
  });

  test("the old Settings window address opens Settings in the app", async ({
    page,
  }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/#\/settings$/);
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expectCurrentScreen(page, "settings");
  });

  test("the title-bar gear opens Settings", async ({ page }) => {
    await page.goto("/#/today", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open settings" }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expectCurrentScreen(page, "settings");
  });

  test("the phone layout has no sideways scrolling and 44px menu targets", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ["today", "drafts", "settings"] as const) {
      await page.goto(`/#/${id}`, { waitUntil: "domcontentloaded" });
      await expectCurrentScreen(page, id);
      const page_ = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(page_.scrollWidth, id).toBeLessThanOrEqual(page_.clientWidth);
      const menu = await mainMenu(page).evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
      expect(menu.scrollWidth, id).toBeLessThanOrEqual(menu.clientWidth);

      const { area } = screenMenu[id];
      const buttons = [
        ...(await mainMenu(page).getByRole("button").all()),
        ...(await sectionsNav(page, area).getByRole("button").all()),
      ];
      expect(buttons.length, id).toBeGreaterThanOrEqual(areaLabels.length);
      for (const button of buttons) {
        const box = await button.boundingBox();
        const name = await button.textContent();
        expect(box, `${id}: ${name}`).not.toBeNull();
        expect(box?.width ?? 0, `${id}: ${name}`).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, `${id}: ${name}`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe("menu areas", () => {
  test("every screen except Get started belongs to exactly one area", () => {
    const sectionIds = homeAreas.flatMap((area) =>
      area.sections.map((section) => section.route.id),
    );
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    const screenIds = homeRoutes
      .map((route) => route.id)
      .filter((id) => id !== "setup");
    expect([...sectionIds].sort()).toEqual([...screenIds].sort());
    // The test helper's map mirrors the app's menu, in order.
    expect(Object.keys(screenMenu)).toEqual(sectionIds);
    expect(homeAreas.map((area) => area.label)).toEqual(areaLabels);
  });
});

/** Opens a screen and waits until its campaign picker is the one on screen. */
async function openLoadedScreen(
  page: Page,
  label: "Ideas" | "Drafts",
): Promise<void> {
  await openScreen(page, label === "Ideas" ? "queue" : "drafts");
  await expect(
    page.getByRole("heading", { level: 2, name: label, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Selected campaign")).toBeVisible();
}

async function createCampaign(
  page: Page,
  name = "Founder-led growth",
): Promise<void> {
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await page.getByLabel("Name").fill(name);
  await page
    .getByLabel("Product")
    .fill("A local-first LinkedIn operations cockpit");
  await page
    .getByLabel("Audience")
    .fill("Solo founders and technical operators");
  await page.getByLabel("Voice").fill("Concrete, concise, practical");
  await page.getByLabel("Tone").fill("Helpful operator");
  await page.getByLabel("Manual keywords").fill("founder content, outbound");
  const dialog = page.getByRole("dialog", { name: "New campaign" });
  await dialog.getByRole("button", { name: "Create campaign" }).click();
  await expect(dialog).toBeHidden();
}

async function addCandidate(
  page: Page,
  author: string,
  activity: string,
): Promise<void> {
  await page.getByRole("button", { name: "Add idea" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add idea" });
  await expect(dialog).toBeVisible();
  await page
    .getByLabel("LinkedIn post URL")
    .fill(`https://www.linkedin.com/posts/example-activity-${activity}/`);
  await page.getByLabel("Post text").fill(`A founder post by ${author}.`);
  await page.getByLabel("Author name").fill(author);
  await page
    .getByLabel("Author profile URL")
    .fill(`https://www.linkedin.com/in/example-${activity}/`);
  await page.getByLabel("Posted at").fill("2026-06-25");
  await page.getByLabel("Source keyword").fill("founder content");
  await page.getByLabel("Match score").fill("87");
  await page.getByLabel("Score reason").fill("Strong audience overlap.");
  await dialog.getByRole("button", { name: "Add idea" }).click();
  await expect(dialog).toBeHidden();
}

async function createDraftFor(page: Page, author: string): Promise<void> {
  await page.getByRole("button", { name: "Create draft" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create draft" });
  await expect(dialog).toBeVisible();
  const ideaValue = await dialog
    .locator("#draft-candidate option")
    .filter({ hasText: author })
    .getAttribute("value");
  if (ideaValue === null) throw new Error(`No idea option for ${author}`);
  await dialog.locator("#draft-candidate").selectOption(ideaValue);
  await dialog.getByLabel("Angle").fill(`A lesson from ${author}`);
  await page.locator("#draft-variant-0-hook").fill("A clear operator hook.");
  await page
    .locator("#draft-variant-0-body")
    .fill("This variant has draft text to review.");
  await page.locator("#draft-variant-0-cta").fill("What would you add?");
  await page.locator("#draft-variant-0-hashtags").fill("#founders");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(dialog).toBeHidden();
}
