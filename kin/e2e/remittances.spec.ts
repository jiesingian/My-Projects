import { test, expect } from "@playwright/test";

/** The remittance log, reached the way a grown-up reaches it: from Cash
 * Flow's Income group, then the form. Only reads -- nothing is logged, so
 * there is nothing to tidy up and nothing to collide with another run. The
 * write path, and who may see what, is asked of the database directly in
 * supabase/tests/rls_remittances.sql. */

test("Cash Flow's Income group links to the remittance log", async ({ page }) => {
  await page.goto("/wealth?seg=cashflow&who=all", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^INCOME/ }).click();
  await page.getByRole("link", { name: /Remittances from abroad/ }).click();
  await expect(page).toHaveURL(/\/wealth\/remittances$/);
  await expect(page.getByRole("heading", { name: "Remittances" })).toBeVisible();
  await expect(page.getByText("CAME HOME THIS MONTH")).toBeVisible();
});

test("the form asks for what was sent, what arrived, who and how", async ({ page }) => {
  await page.goto("/wealth/remittances/new", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Log a remittance" })).toBeVisible();
  for (const name of ["From", "To", "Currency", "How it came", "Landed in (optional)"]) {
    await expect(page.getByRole("combobox", { name, exact: true })).toBeVisible();
  }
  for (const name of ["Amount sent", "Pesos that arrived"]) {
    await expect(page.getByRole("spinbutton", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("textbox", { name: /^Sent on/ })).toBeVisible();
  // The Gulf currencies are offered, near the top, since that is where much
  // of the money comes from.
  const currencies = await page.getByRole("combobox", { name: "Currency", exact: true }).locator("option").allTextContents();
  expect(currencies.slice(0, 5)).toEqual(["USD", "SAR", "AED", "QAR", "KWD"]);
  // The rate line settles into an answer either way (a rate, or a plain
  // "type the pesos") -- it never stays on "Looking up".
  await expect(page.getByText(/ECB rate on|No reference rate/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/Just me/)).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Log remittance" })).toBeEnabled();
});
