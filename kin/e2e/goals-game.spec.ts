import { test, expect } from "@playwright/test";

/** Planner → Goals → Game, Badges, Shop, Set up (Janine, 20 October),
 * opened as the sample household. Read-only: nothing is tapped or saved, so
 * it is safe on shared dev. The rules themselves are tested in the database
 * (supabase/tests/pglite/probes/goals-game.mjs) and e2e/game.logic.spec.ts. */

const VIEWS = [
  { g: "game", expect: /Level \d|Make healthy habits a family game/ },
  { g: "badges", expect: /badges/ },
  { g: "shop", expect: /coins/ },
  { g: "setup", expect: /Game goals/ },
];

for (const v of VIEWS) {
  test(`Planner → Goals → ${v.g} opens`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/planner?seg=goals&g=${v.g}`);
    await expect(page.getByRole("link", { name: "🎮 Game" })).toBeVisible();
    await expect(page.getByText(v.expect).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("the ordinary Goals view keeps its switch to the game", async ({ page }) => {
  await page.goto("/planner?seg=goals");
  // Planner's own "Goals" tab and the switch's: both lead here.
  await expect(page.locator('a[href="/planner?seg=goals&g=goals"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "🎮 Game" })).toBeVisible();
});
