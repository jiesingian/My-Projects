import { test, expect } from "@playwright/test";

/** The year book, made in a real browser from the sample household's journal.
 * Read-only: the book is drawn on the phone and saved, nothing is written. The
 * household is on Plus (QA_HOUSEHOLDS.md); if it ever is not, the page must
 * say so instead of offering a book. */

test("the year book previews its pages and saves a PDF", async ({ page }) => {
  await page.goto("/journal/year-book");
  await expect(page.getByRole("heading", { name: "Year book" })).toBeVisible();
  if (await page.getByText("is part of Kin Plus").isVisible()) {
    await expect(page.getByRole("button", { name: "Make the PDF" })).toHaveCount(0);
    return;
  }
  const boxes = page.getByRole("checkbox");
  if ((await boxes.count()) === 0) {
    await expect(page.getByText(/Nothing for \d{4} yet/)).toBeVisible();
    return;
  }
  // Tick just the first, to keep the run short.
  const n = await boxes.count();
  for (let i = 0; i < n; i++) if (await boxes.nth(i).isChecked()) await boxes.nth(i).uncheck();
  await boxes.first().check();

  await page.getByRole("button", { name: "Preview" }).click();
  const pages = page.getByRole("img", { name: /^Page \d+$/ });
  await expect(pages.first()).toBeVisible({ timeout: 30_000 });
  // Cover, the month, the entry, the end.
  await expect(pages).toHaveCount(4);

  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Make the PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/year book \d{4}\.pdf$/);
  const path = await file.path();
  const bytes = (await import("node:fs")).readFileSync(path);
  expect(bytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
  expect(bytes.toString("latin1")).toContain("/Count 4");
});
