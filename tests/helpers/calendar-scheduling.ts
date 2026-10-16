import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Picks a wall-clock `YYYY-MM-DDTHH:mm` value in a DateTimePicker inside
 * `scope` (usually a dialog): month grid for the date, time field for time.
 */
export async function pickDateTime(
  page: Page,
  scope: Locator,
  value: string,
): Promise<void> {
  const [date, time] = value.split("T");
  if (!date || !time) throw new Error(`Bad wall-clock value: ${value}`);
  await scope.getByLabel("Date", { exact: true }).click();
  const popover = page.getByRole("dialog", { name: "Choose a date" });
  await expect(popover).toBeVisible();
  const target = popover.locator(
    `td[data-day="${date}"]:not([data-outside]) button`,
  );
  // Move with the grid's own keys: Shift+PageUp/Down jumps a year,
  // PageUp/Down a month. Focus starts on the selected or first day.
  const shown = await popover
    .locator("td[data-day]:not([data-outside])")
    .first()
    .getAttribute("data-day");
  const [shownYear = 0, shownMonth = 0] = (shown ?? "").split("-").map(Number);
  const [targetYear = 0, targetMonth = 0] = date.split("-").map(Number);
  const months = (targetYear - shownYear) * 12 + (targetMonth - shownMonth);
  if (months !== 0) {
    const focused = popover.locator("td[data-selected] button");
    await (
      (await focused.count()) > 0
        ? focused
        : popover.locator("td[data-day]:not([data-outside]) button").first()
    ).focus();
    const years = Math.trunc(months / 12);
    const rest = months - years * 12;
    for (let i = 0; i < Math.abs(years); i += 1)
      await page.keyboard.press(years > 0 ? "Shift+PageDown" : "Shift+PageUp");
    for (let i = 0; i < Math.abs(rest); i += 1)
      await page.keyboard.press(rest > 0 ? "PageDown" : "PageUp");
  }
  await target.click();
  await expect(popover).toBeHidden();
  await scope.getByLabel("Time", { exact: true }).fill(time);
}

/**
 * Starts on an approval card, follows its Calendar button, plans the post
 * when it isn't on the plan yet, and schedules it. Ends on the Calendar.
 */
export async function scheduleFromApprovalCard(
  page: Page,
  input: {
    scheduledFor: string;
    timezone: string;
    scope?: Locator;
    triggerLabel?: string;
    /** Native rules may refuse the time (safety limits); skip the check. */
    expectScheduled?: boolean;
  },
): Promise<void> {
  const scope = input.scope ?? page;
  await scope
    .getByRole("button", {
      name: input.triggerLabel ?? "Schedule in Calendar",
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toBeVisible();

  const unplanned = page.getByTestId("calendar-link-unplanned");
  const slot = page.locator('[data-highlighted="true"]');
  await expect(unplanned.or(slot)).toBeVisible();
  if (await unplanned.isVisible()) {
    await unplanned.getByRole("button", { name: "Add to plan" }).click();
    const plan = page.getByRole("dialog", { name: "Plan a post" });
    await expect(plan).toBeVisible();
    await plan.getByLabel("Time zone").fill(input.timezone);
    await pickDateTime(page, plan, input.scheduledFor);
    const look = plan.getByLabel("Look and feel");
    if ((await look.inputValue()).trim() === "")
      await look.fill("Text-only post with a crisp first line.");
    await plan.getByRole("button", { name: "Plan post" }).click();
    await expect(plan).toBeHidden();
    await expect(slot).toBeVisible();
    await slot.getByRole("button", { name: "Schedule post" }).click();
  } else if (
    await slot.getByRole("button", { name: "Schedule post" }).isVisible()
  ) {
    await slot.getByRole("button", { name: "Schedule post" }).click();
  } else {
    await slot.getByRole("button", { name: "Reschedule" }).click();
    await rescheduleInDialog(page, input);
  }
  if (input.expectScheduled === false) return;
  await expect(
    slot.getByText("Scheduled", { exact: true }).first(),
  ).toBeVisible();
}

/** Fills and saves the open "Pick a new time" dialog. */
export async function rescheduleInDialog(
  page: Page,
  input: { scheduledFor: string; timezone: string },
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Pick a new time" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Time zone").fill(input.timezone);
  await pickDateTime(page, dialog, input.scheduledFor);
  await dialog.getByRole("button", { name: "Save new time" }).click();
  await expect(dialog).toBeHidden();
}
