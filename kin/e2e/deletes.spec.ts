import { test, expect, type Page } from "@playwright/test";
import { tidyUpAfter } from "./support/qa-household";

/** Removing things, which is where losing things lives.
 *
 * Adding is forgiving: if it fails you notice, because what you added is not
 * there. Deleting is not. A delete that silently does nothing looks identical
 * to one that worked until you come back for the thing, and a delete that
 * removes more than it was asked to is worse still. So each of these makes
 * something, removes it, and then checks both halves: the thing is gone, and
 * everything beside it is not.
 *
 * Which means every test here deliberately leaves a keeper behind -- proving
 * the delete was narrow is the whole point -- and those keepers are what used
 * to accumulate. They are swept at the foot, after the assertions that need
 * them have run. */

/** Fixed, so the sweep at the foot also collects what a crashed run left. */
const FAMILY = "E2E-DEL";
const RUN = `${FAMILY}-${Date.now().toString(36)}`;

/** The app asks before destroying anything, and reports failure through
 * window.alert. Accept the question, and treat an alert as a failure -- it is
 * the only way the action tells the browser it refused. */
function handleDialogs(page: Page) {
  const alerts: string[] = [];
  page.on("dialog", async (d) => {
    if (d.type() === "alert") alerts.push(d.message().slice(0, 200));
    await d.accept();
  });
  return alerts;
}

test.describe("removing things", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  /* The keepers, and anything a failed test left half-made. Same sweep and
   * the same account as writes.spec: RLS keeps it inside the throwaway
   * household, and it asserts rather than hopes. */
  test.afterAll(async () => {
    await tidyUpAfter(FAMILY);
  });

  test("a routine can be removed, and takes nothing else with it", async ({ page }) => {
    const doomed = `${RUN} doomed routine`;
    const keeper = `${RUN} keeper routine`;
    const alerts = handleDialogs(page);

    for (const title of [keeper, doomed]) {
      await page.goto("/planner/routines/new", { waitUntil: "networkidle" });
      await page.fill('input[name="title"]', title);
      await page.getByText("Whole family", { exact: true }).first().click();
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL((u) => new URL(u).pathname !== "/planner/routines/new", { timeout: 30_000 });
    }

    await page.goto("/planner?seg=routines", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(doomed);
    await expect(page.locator("body")).toContainText(keeper);

    // Each row is a .blueprint card holding both its title and its controls,
    // which is what makes "the Remove that belongs to this one" expressible.
    const card = page.locator(".blueprint").filter({ hasText: doomed });
    await expect(card, "the routine has no card of its own").toHaveCount(1);

    // Removal is two taps: "Remove", then a confirmation in its place.
    await card.getByRole("button", { name: /remove/i }).first().click();
    await page.waitForTimeout(500);
    await card.getByRole("button", { name: /remove|yes|confirm|sure/i }).last().click();
    await page.waitForTimeout(3000);

    await page.goto("/planner?seg=routines", { waitUntil: "networkidle" });
    await expect(page.locator("body"), "the removed routine is still listed").not.toContainText(doomed);
    await expect(page.locator("body"), "removing one routine removed another").toContainText(keeper);
    expect(alerts, "the app reported an error while removing").toEqual([]);
  });

  test("a savings goal can be deleted, and takes nothing else with it", async ({ page }) => {
    const doomed = `${RUN} doomed goal`;
    const keeper = `${RUN} keeper goal`;
    const alerts = handleDialogs(page);

    for (const title of [keeper, doomed]) {
      await page.goto("/wealth/add", { waitUntil: "networkidle" });
      await page.fill('input[name="title"]', title);
      await page.fill('input[name="target_amount"]', "1000");
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL((u) => new URL(u).pathname !== "/wealth/add", { timeout: 30_000 });
    }

    await page.goto("/wealth?seg=assets", { waitUntil: "networkidle" });
    await expect(page.locator("body")).toContainText(doomed);
    await expect(page.locator("body")).toContainText(keeper);

    const card = page.locator(".blueprint").filter({ hasText: doomed });
    await expect(card, "the goal has no card of its own").toHaveCount(1);
    const remove = card.getByRole("button", { name: /delete|remove/i }).first();
    await expect(remove, "no way to delete a goal from the UI").toBeVisible();
    await remove.click();
    await page.waitForTimeout(3000);

    await page.goto("/wealth?seg=assets", { waitUntil: "networkidle" });
    await expect(page.locator("body"), "the deleted goal is still listed").not.toContainText(doomed);
    await expect(page.locator("body"), "deleting one goal deleted another").toContainText(keeper);
    expect(alerts, "the app reported an error while deleting").toEqual([]);
  });
});
