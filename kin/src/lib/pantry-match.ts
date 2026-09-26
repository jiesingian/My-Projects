import { normalizeKey } from "@/lib/pricebook";

/** Which recipes the house could cook with what is already in it.
 *
 * Staples every kitchen has (salt, water, oil, pepper) do not count either
 * way: a recipe is not "nearly ready" because the salt is in, and it is not
 * blocked because nobody has told Kin there is water. */

const STAPLES = new Set(["salt", "water", "oil", "cooking oil", "pepper", "black pepper", "ground pepper", "sugar", "ice"].map(normalizeKey));

export type PantryMatch<R> = { recipe: R; have: number; need: number; missing: string[] };

export function rankByPantry<R extends { ingredients: { name: string }[] }>(recipes: R[], pantryKeys: Set<string>, limit = 5): PantryMatch<R>[] {
  if (pantryKeys.size === 0) return [];
  const out: PantryMatch<R>[] = [];
  for (const recipe of recipes) {
    const real = recipe.ingredients.filter((i) => !STAPLES.has(normalizeKey(i.name)));
    if (real.length < 2) continue;
    const missing = real.filter((i) => !pantryKeys.has(normalizeKey(i.name))).map((i) => i.name);
    const have = real.length - missing.length;
    // Half or better, and at most three things to pick up on the way home.
    if (have * 2 < real.length || missing.length > 3) continue;
    out.push({ recipe, have, need: real.length, missing });
  }
  return out.sort((a, b) => a.missing.length - b.missing.length || b.have / b.need - a.have / a.need).slice(0, limit);
}

/** The week's dinners from the pantry (26 September): each day still without
 * a dinner gets the best-matching recipe not already given to another day,
 * in date order, until the matches run out. Days that have a dinner are left
 * exactly as they are -- this only fills gaps, it never replaces a plan. */
export function planDinners<R>(days: string[], hasDinner: Set<string>, matches: PantryMatch<R>[]): { date: string; match: PantryMatch<R> }[] {
  const out: { date: string; match: PantryMatch<R> }[] = [];
  let next = 0;
  for (const date of days) {
    if (hasDinner.has(date)) continue;
    if (next >= matches.length) break;
    out.push({ date, match: matches[next++] });
  }
  return out;
}
