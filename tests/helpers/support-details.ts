import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Opens every "Details for support" disclosure inside `scope` that lists
 * `label`, then asserts one of them shows `label` with exactly `value`.
 * Internal ids live behind this disclosure (docs/glossary.md), so tests
 * check them there instead of in the primary UI.
 */
export async function expectSupportDetail(
  scope: Page | Locator,
  label: string,
  value: string | number,
): Promise<void> {
  const page = "page" in scope ? scope.page() : scope;
  const disclosures = scope.locator("details[data-support]").filter({
    has: page.locator("dt").getByText(label, { exact: true }),
  });
  await expect(disclosures.first()).toBeAttached();
  const count = await disclosures.count();
  for (let index = 0; index < count; index += 1) {
    const details = disclosures.nth(index);
    if ((await details.getAttribute("open")) === null) {
      await details.locator("summary").click();
    }
  }
  const values = await disclosures.evaluateAll(
    (nodes, wanted) =>
      nodes.flatMap((node) =>
        Array.from(node.querySelectorAll("dt"))
          .filter((dt) => dt.textContent?.trim() === wanted)
          .map((dt) => dt.nextElementSibling?.textContent?.trim() ?? ""),
      ),
    label,
  );
  expect(values).toContain(String(value));
  await expect(
    disclosures.locator("dt").getByText(label, { exact: true }).first(),
  ).toBeVisible();
}
