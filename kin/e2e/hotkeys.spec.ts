import { test, expect } from "@playwright/test";

/** Keyboard shortcuts on a computer, in the real app (lib/hotkeys.ts decides,
 * components/keyboard-shortcuts.tsx acts). Read-only: it presses keys as
 * the sample household and saves nothing. */

test("g then p goes to the Planner; ? lists the shortcuts and Esc closes it", async ({ page }) => {
  await page.goto("/today");
  await expect(page.locator(".kin-content").first()).toBeVisible();
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await expect(page).toHaveURL(/\/planner/);

  await page.keyboard.press("Shift+?");
  const help = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(help).toBeVisible();
  await expect(help.getByText("Go to Today")).toBeVisible();
  // Over the open list nothing moves the page behind it (wrap-up check,
  // 22 October: it did, because Kin's sheets never say aria-modal).
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/planner/);
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
});

test("Ctrl+K opens Ask Kin", async ({ page }) => {
  await page.goto("/today");
  await expect(page.locator(".kin-content").first()).toBeVisible();
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("typing in a field never fires a shortcut", async ({ page }) => {
  await page.goto("/today");
  const line = page.locator(".kin-quickline-input");
  test.skip(!(await line.count()), "no one-line add on this Today");
  // Focus only once the page is hydrated and settled: focused any earlier,
  // hydration took the focus back and "gp" went to the page as g then p
  // (seen once in five runs, 22 October).
  await page.waitForLoadState("networkidle").catch(() => {});
  await line.click();
  await expect(line).toBeFocused();
  await page.keyboard.type("gp/?");
  await expect(page).toHaveURL(/\/today/);
  await expect(line).toHaveValue("gp/?");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("↓ and ↑ move through a list of rows (Settings)", async ({ page }) => {
  await page.goto("/settings");
  const rows = page.locator('[data-kin-arrows="list"]').first().locator("a[href]");
  test.skip((await rows.count()) < 2, "fewer than two rows here");
  // Settled first, as for typing above: focused straight after goto,
  // hydration can take the focus back before the key arrives.
  await page.waitForLoadState("networkidle").catch(() => {});
  await rows.nth(0).focus();
  await expect(rows.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rows.nth(0)).toBeFocused();
});
