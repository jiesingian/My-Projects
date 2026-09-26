import { test, expect } from "@playwright/test";
import { planDinners, rankByPantry } from "@/lib/pantry-match";
import { normalizeKey } from "@/lib/pricebook";

/** "Cook from what you have" only suggests what the house nearly covers. */

const r = (name: string, ...ing: string[]) => ({ name, ingredients: ing.map((n) => ({ name: n })) });
const pantry = new Set(["pork", "tamarind", "kangkong", "radish", "onion", "garlic", "soy sauce", "vinegar"].map(normalizeKey));

test("the closest match comes first, and staples do not count either way", () => {
  const out = rankByPantry([r("Adobo", "pork", "soy sauce", "vinegar", "garlic", "bay leaf", "salt"), r("Sinigang", "pork", "tamarind", "kangkong", "radish", "onion", "water")], pantry);
  expect(out.map((m) => m.recipe.name)).toEqual(["Sinigang", "Adobo"]);
  expect(out[1].missing).toEqual(["bay leaf"]);
  expect(out[0].need).toBe(5);
});

test("less than half covered, or more than three missing, is not suggested", () => {
  expect(rankByPantry([r("Kare-kare", "oxtail", "peanut butter", "eggplant", "string beans", "bagoong", "onion")], pantry)).toEqual([]);
});

test("an empty pantry suggests nothing rather than everything", () => {
  expect(rankByPantry([r("Adobo", "pork", "soy sauce")], new Set())).toEqual([]);
});

test("the week plan fills only the empty dinners, each with a different recipe, until the matches run out", () => {
  const matches = rankByPantry([r("Sinigang", "pork", "tamarind", "kangkong", "radish"), r("Adobo", "pork", "soy sauce", "vinegar", "garlic")], pantry);
  const plan = planDinners(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"], new Set(["2026-09-29"]), matches);
  expect(plan.map((p) => [p.date, p.match.recipe.name])).toEqual([
    ["2026-09-28", "Sinigang"],
    ["2026-09-30", "Adobo"],
  ]);
});

test("nothing close enough in the pantry plans nothing", () => {
  expect(planDinners(["2026-09-28"], new Set(), rankByPantry([r("Adobo", "pork", "soy sauce")], new Set()))).toEqual([]);
});
