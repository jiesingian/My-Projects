import { test, expect } from "@playwright/test";

/** The monthly money recap opens for the sample household's grown-up and
 * moves between months, reading only. The arithmetic is pinned without a
 * browser in money-recap.logic.spec.ts. */

test("the money recap renders last month, and steps back a month", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/wealth/recap", { waitUntil: "networkidle" });
  await expect(page.locator("h3").first()).toHaveText(/^[A-Z][a-z]+ \d{4}$/);
  const shown = await page.locator("h3").first().textContent();
  await page.getByRole("link", { name: "The month before" }).click();
  await expect(page.locator("h3").first()).not.toHaveText(shown ?? "");
  await expect(page).toHaveURL(/\/wealth\/recap\?month=\d{4}-\d{2}$/);
  expect(errors, `the page threw: ${errors.join(" | ")}`).toEqual([]);
});

test("a month that has not ended yet falls back to last month", async ({ page }) => {
  await page.goto("/wealth/recap?month=2999-01", { waitUntil: "networkidle" });
  await expect(page.locator("h3").first()).not.toHaveText(/2999/);
});
