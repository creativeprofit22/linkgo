import { expect, type Locator, type Page } from "@playwright/test";

/** The five Main-menu areas (see docs/features/navigation-areas.md). */
export type AreaLabel =
  | "Today"
  | "Create"
  | "Calendar"
  | "Results"
  | "Settings";

export const areaLabels: readonly AreaLabel[] = [
  "Today",
  "Create",
  "Calendar",
  "Results",
  "Settings",
];

/**
 * Where every in-area screen sits: its area and its sub-view label. Areas
 * with one sub-view (Today, Calendar, Results) show no section menu.
 * Kept in menu order; `tests/navigation.spec.ts` checks it against the app.
 */
export const screenMenu = {
  today: { area: "Today", section: "Today" },
  campaigns: { area: "Create", section: "Campaigns" },
  queue: { area: "Create", section: "Ideas" },
  drafts: { area: "Create", section: "Drafts" },
  approvals: { area: "Create", section: "Approvals" },
  comments: { area: "Create", section: "Replies" },
  calendar: { area: "Calendar", section: "Calendar" },
  metrics: { area: "Results", section: "Analytics" },
  settings: { area: "Settings", section: "General" },
  integrations: { area: "Settings", section: "Connected accounts" },
  playbooks: { area: "Settings", section: "Brand voice" },
  safety: { area: "Settings", section: "Safety" },
  autopilot: { area: "Settings", section: "Autopilot" },
  workflows: { area: "Settings", section: "Automations" },
  agents: { area: "Settings", section: "AI assistant" },
  backlog: { area: "Settings", section: "Tasks" },
} as const satisfies Record<string, { area: AreaLabel; section: string }>;

export type MenuScreenId = keyof typeof screenMenu;

/** Areas that show a section menu (more than one sub-view). */
export function hasSections(area: AreaLabel): boolean {
  return (
    Object.values(screenMenu).filter((entry) => entry.area === area).length > 1
  );
}

export function mainMenu(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main menu" });
}

/** One of the five area buttons in the Main menu. */
export function areaButton(page: Page, area: AreaLabel): Locator {
  return mainMenu(page).getByRole("button", { name: area, exact: true });
}

export function sectionsNav(page: Page, area: AreaLabel): Locator {
  return page.getByRole("navigation", { name: `${area} sections` });
}

/** A sub-view button in an area's section menu (label is a name prefix). */
export function sectionButton(
  page: Page,
  area: AreaLabel,
  section: string,
): Locator {
  return sectionsNav(page, area).getByRole("button", {
    name: new RegExp(`^${section}`),
  });
}

/**
 * Opens a sub-view the way a person would: the area in the Main menu, then
 * (for areas with several sub-views) the section in "<Area> sections".
 */
export async function openSection(
  page: Page,
  area: AreaLabel,
  section?: string,
): Promise<void> {
  await areaButton(page, area).click();
  if (section === undefined || !hasSections(area)) return;
  await sectionButton(page, area, section).click();
}

/** Opens a screen by its address id through the menu. */
export async function openScreen(page: Page, id: MenuScreenId): Promise<void> {
  const { area, section } = screenMenu[id];
  await openSection(page, area, section);
}

/** Asserts the screen's area (and section, when shown) are marked current. */
export async function expectCurrentScreen(
  page: Page,
  id: MenuScreenId,
): Promise<void> {
  const { area, section } = screenMenu[id];
  await expect(areaButton(page, area), id).toHaveAttribute(
    "aria-current",
    "page",
  );
  if (hasSections(area)) {
    await expect(sectionButton(page, area, section), id).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
}
