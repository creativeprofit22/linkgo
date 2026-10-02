import { expect, test, type Locator, type Page } from "@playwright/test";
import { z } from "zod";

import { approvalsRoute } from "../src/features/approvals/schemas";
import { contentCalendarRoute } from "../src/features/content-calendar/schemas";
import { draftsRoute } from "../src/features/drafts/schemas";
import {
  defineRoute,
  emptyRouteSearch,
  formatRouteHash,
  parseRouteHash,
  splitRouteHash,
} from "../src/lib/navigation/route-contract";
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

  test("every menu screen has its own address", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/#\/campaigns$/);

    const nav = page.getByRole("navigation", { name: "Main menu" });
    // A new menu entry without a row here fails instead of going untested.
    await expect(nav.getByRole("button")).toHaveCount(menuScreens.length);
    for (const { label, id } of menuScreens) {
      const button = menuButton(page, label);
      await button.click();
      await expect(page, label).toHaveURL(new RegExp(`#/${id}$`));
      await expect(button, label).toHaveAttribute("aria-current", "page");
    }

    // A typed address opens its screen directly.
    for (const { label, id } of [
      { label: "Automations", id: "workflows" },
      { label: "Tasks", id: "backlog" },
    ]) {
      await page.goto(`/#/${id}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`#/${id}$`));
      await expect(menuButton(page, label), label).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.getByTestId("navigation-unknown-screen")).toHaveCount(
        0,
      );
    }

    await nav.getByRole("button", { name: /^Ideas/ }).click();
    await expect(page).toHaveURL(/#\/queue$/);
    await nav.getByRole("button", { name: /^Analytics/ }).click();
    await expect(page).toHaveURL(/#\/metrics$/);

    await page.goBack();
    await expect(page).toHaveURL(/#\/queue$/);
    await expect(nav.getByRole("button", { name: /^Ideas/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goForward();
    await expect(page).toHaveURL(/#\/metrics$/);
  });

  test("opening the screen already showing adds no history entry", async ({
    page,
  }) => {
    const nav = page.getByRole("navigation", { name: "Main menu" });
    const ideas = nav.getByRole("button", { name: /^Ideas/ });
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
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await createCampaign(page);
    await openScreen(page, "Ideas");
    await addCandidate(page, "Jane Operator", "123");
    await addCandidate(page, "Sam Builder", "456");

    // Write one draft per idea so the filter has something to hide.
    await openScreen(page, "Drafts");
    await createDraftFor(page, "Jane Operator");
    await createDraftFor(page, "Sam Builder");
    await expect(
      page.getByRole("heading", { name: "Sam Builder" }),
    ).toBeVisible();

    await openScreen(page, "Ideas");
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
    await expect(
      page
        .getByRole("navigation", { name: "Main menu" })
        .getByRole("button", { name: /^Ideas/ }),
    ).toHaveAttribute("aria-current", "page");

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
    await page.goto("/", { waitUntil: "domcontentloaded" });
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
    await page.goto("/", { waitUntil: "domcontentloaded" });
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

  test("an unknown screen opens Campaigns with a message", async ({ page }) => {
    await page.goto("/#/nope", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("navigation-unknown-screen")).toHaveText(
      "That link didn’t match a screen, so we opened Campaigns.",
    );
    await expect(
      page
        .getByRole("navigation", { name: "Main menu" })
        .getByRole("button", { name: /^Campaigns/ }),
    ).toHaveAttribute("aria-current", "page");

    await openScreen(page, "Ideas");
    await expect(page.getByTestId("navigation-unknown-screen")).toHaveCount(0);
  });

  test("reopening the app restores the last screen", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openScreen(page, "Safety");
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
    await expect(
      page
        .getByRole("navigation", { name: "Main menu" })
        .getByRole("button", { name: /^Safety/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("a stored screen that no longer exists is ignored", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("linkgo.navigation.last-screen", "removed");
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/#\/campaigns$/);
    await expect(page.getByTestId("navigation-unknown-screen")).toHaveCount(0);
  });
});

/** Main-menu labels and the address id each one must open (see home.tsx). */
const menuScreens = [
  { label: "Campaigns", id: "campaigns" },
  { label: "Autopilot", id: "autopilot" },
  { label: "Tasks", id: "backlog" },
  { label: "Ideas", id: "queue" },
  { label: "Drafts", id: "drafts" },
  { label: "Approvals", id: "approvals" },
  { label: "Calendar", id: "calendar" },
  { label: "Auto-posting", id: "scheduler" },
  { label: "Comments", id: "comments" },
  { label: "Analytics", id: "metrics" },
  { label: "Automations", id: "workflows" },
  { label: "AI assistant", id: "agents" },
  { label: "Brand voice", id: "playbooks" },
  { label: "Connected accounts", id: "integrations" },
  { label: "Safety", id: "safety" },
] as const;

function menuButton(page: Page, label: string): Locator {
  return page
    .getByRole("navigation", { name: "Main menu" })
    .getByRole("button", { name: new RegExp(`^${label}`) });
}

/** Opens a screen and waits until its campaign picker is the one on screen. */
async function openLoadedScreen(
  page: Page,
  label: "Ideas" | "Drafts",
): Promise<void> {
  await openScreen(page, label);
  await expect(
    page.getByRole("heading", { level: 2, name: label, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Selected campaign")).toBeVisible();
}

async function openScreen(page: Page, label: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Main menu" })
    .getByRole("button", { name: new RegExp(`^${label}`) })
    .click();
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
