import { test, expect } from "@playwright/test";

/** Planner → Goals → Target, Badges, Shop, Set up (Janine, 20 October),
 * opened as the sample household. Read-only: nothing is tapped or saved, so
 * it is safe on shared dev. The rules themselves are tested in the database
 * (supabase/tests/pglite/probes/goals-game.mjs) and e2e/game.logic.spec.ts. */

const VIEWS = [
  { g: "game", expect: /Level \d|Targets come from your goals/ },
  { g: "badges", expect: /badges/ },
  { g: "shop", expect: /coins/ },
  { g: "setup", expect: /Targets ·/ },
];

for (const v of VIEWS) {
  test(`Planner → Goals → ${v.g} opens`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/planner?seg=goals&g=${v.g}`);
    // The view switch: one button like Who (26 October), not a row of links.
    await expect(page.getByRole("button", { name: "Choose view" })).toBeVisible();
    await expect(page.getByText(v.expect).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("the ordinary Goals view keeps its switch to the game", async ({ page }) => {
  await page.goto("/planner?seg=goals");
  await expect(page.getByRole("button", { name: /^View: Goals\./ })).toBeVisible();
  // Its list holds the game's views.
  await page.getByRole("button", { name: "Choose view" }).click();
  await expect(page.getByRole("menuitemradio", { name: "🎯 Target" })).toBeVisible();
});
