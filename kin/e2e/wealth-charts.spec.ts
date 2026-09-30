import { test, expect } from "@playwright/test";

/** The Wealth charts approved on 30 September, as the page wires them. Only
 * reads (opening A&L does keep the viewer's own month of net worth up to
 * date, which is the feature working, not a test row). Who may read and write
 * budgets and snapshots is asked of the database in
 * supabase/tests/pglite/probes/wealth-charts.mjs. */

test("cash flow: each period is a button, the current one pressed, and tapping moves the summary", async ({ page }) => {
  await page.goto("/wealth?seg=cashflow&who=all&range=month", { waitUntil: "networkidle" });
  const periods = page.locator('svg [role="button"][aria-pressed]');
  const count = await periods.count();
  expect(count, "one button per month in the chart").toBeGreaterThan(1);
  await expect(periods.nth(count - 1)).toHaveAttribute("aria-pressed", "true");
  await periods.nth(0).click();
  await expect(periods.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(periods.nth(count - 1)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/^NET$/)).toBeVisible();
});

test("expenses: the category donut and spending by person sit where they were approved", async ({ page }) => {
  await page.goto("/wealth?seg=cashflow&who=all&range=month", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^EXPENSES/ }).click();
  // Either the donut (money went out this month) or the empty state says so.
  await expect(page.getByText(/^SPENT$|Nothing spent yet this month/).first()).toBeVisible();
  await expect(page.getByText("SPENDING BY PERSON")).toBeVisible();
});

test("A&L: net worth over time, or a plain line saying it starts now", async ({ page }) => {
  await page.goto("/wealth?seg=assets&who=all", { waitUntil: "networkidle" });
  await expect(page.getByRole("img", { name: /^Net worth over \d+ months/ }).or(page.getByText(/keeps your net worth each month from now on/))).toBeVisible();
});
