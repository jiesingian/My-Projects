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
  await line.focus();
  await page.keyboard.type("gp/?");
  await expect(page).toHaveURL(/\/today/);
  await expect(line).toHaveValue("gp/?");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
