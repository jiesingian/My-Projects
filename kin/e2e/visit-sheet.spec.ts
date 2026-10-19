import { test, expect } from "@playwright/test";

/** The doctor-visit sheet opens for the sample household's grown-up from a
 * child's Health page, with every section a doctor asks about, reading only.
 * What goes on it is pinned without a browser in visit-sheet.logic.spec.ts;
 * who may write questions, in the PGlite probe visit-questions.mjs. */

test("a child's doctor-visit sheet opens from Health with its sections", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/family?seg=profile", { waitUntil: "networkidle" });
  const row = page.locator('a[href^="/family/members/"]').filter({ hasText: /Alex|Robin/ }).first();
  await expect(row, "the sample household should have a managed child").toBeVisible();
  const href = (await row.getAttribute("href"))!.split("?")[0];

  await page.goto(`${href}?view=health`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Doctor-visit sheet/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`${href}/visit-sheet$`));
  await expect(page.getByText(/FOR THE DOCTOR/)).toBeVisible();
  for (const section of ["Allergies", "Medicines now", "Conditions", /Recent readings/, /Recent illness/, "Questions to ask"]) {
    await expect(page.getByRole("heading", { level: 4, name: section })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  expect(errors, `the page threw: ${errors.join(" | ")}`).toEqual([]);
});
