import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** The guided tour on Today (guided-tour.tsx), replayed from Settings.
 *
 * Read-only: "seen" lives in this browser's storage, nothing is written to
 * the household. On a phone and on a desktop, where the tab bar is a sidebar:
 * five steps, each heading taking focus, the keyboard stepping and Escape
 * skipping, and no axe problems in the open dialog. */
for (const vp of [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
]) {
  test(`Show me around replays the tour (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/settings");
    await page.getByRole("link", { name: /Show me around/ }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible();

    const titles = ["This is Today", "Planner", "Chat", "Family and health", "Ask Kin"];
    for (const [i, title] of titles.entries()) {
      await expect(dlg.getByText(`${i + 1} of 5`)).toBeVisible();
      await expect(dlg.getByRole("heading", { name: title })).toBeFocused();
      if (i === 0) {
        const axe = await new AxeBuilder({ page }).include(".kin-tour-card").withTags(["wcag2a", "wcag2aa"]).analyze();
        expect(axe.violations.map((v) => v.id)).toEqual([]);
      }
      if (i < titles.length - 1) await dlg.getByRole("button", { name: "Next" }).click();
    }
    await dlg.getByRole("button", { name: "Done" }).click();
    await expect(dlg).toBeHidden();
    await expect(page).toHaveURL(/\/today$/);

    // The keyboard: arrows step, Escape skips.
    await page.goto("/today?tour=1");
    await expect(dlg).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(dlg.getByText("2 of 5")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(dlg.getByText("1 of 5")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  });
}
