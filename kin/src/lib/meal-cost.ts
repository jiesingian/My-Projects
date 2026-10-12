import { resolveUnitPrice } from "@/lib/pricebook";
import { isStaple } from "@/lib/pantry-match";

/** What a planned meal costs, from the same price book as the shopping list
 * (Jonathan, 13 October).
 *
 * A recipe says "2 cups" or "5 tbsp"; the price book says "per L" or "per
 * pack". An amount is priced only when its unit can honestly become the
 * book's: the same unit, grams to kilos, cups and spoons to litres, pieces to
 * dozens. Anything else -- tablespoons of oats against a pack price -- is
 * counted as not priced rather than guessed. Staples (salt, water, oil) are
 * left out of both, as everywhere else. */

type Dimension = "mass" | "volume" | "count";
const UNIT: Record<string, { dim: Dimension; base: number }> = {
  g: { dim: "mass", base: 1 },
  gram: { dim: "mass", base: 1 },
  kg: { dim: "mass", base: 1000 },
  kilo: { dim: "mass", base: 1000 },
  ml: { dim: "volume", base: 1 },
  l: { dim: "volume", base: 1000 },
  liter: { dim: "volume", base: 1000 },
  litre: { dim: "volume", base: 1000 },
  cup: { dim: "volume", base: 240 },
  tbsp: { dim: "volume", base: 15 },
  tablespoon: { dim: "volume", base: 15 },
  tsp: { dim: "volume", base: 5 },
  teaspoon: { dim: "volume", base: 5 },
  pc: { dim: "count", base: 1 },
  pcs: { dim: "count", base: 1 },
  piece: { dim: "count", base: 1 },
  dozen: { dim: "count", base: 12 },
};

function unitOf(raw: string | null): string {
  const u = (raw ?? "pc").trim().toLowerCase().replace(/\.$/, "");
  if (UNIT[u]) return u;
  // "Cups", "Kilos", "pieces"
  if (u.endsWith("s") && UNIT[u.slice(0, -1)]) return u.slice(0, -1);
  return u;
}

/** One ingredient's cost, or null when it cannot be priced honestly. */
export function ingredientCost(
  name: string,
  amount: number | null,
  unit: string | null,
  familyPrices: Map<string, { unit_price: number; unit: string }>,
): number | null {
  const looked = resolveUnitPrice(name, familyPrices);
  if (looked.price == null) return null;
  const qty = amount ?? (unit ? null : 1);
  if (qty == null) return null;
  const have = unitOf(unit);
  const book = unitOf(looked.unit);
  if (have === book) return qty * looked.price;
  const a = UNIT[have];
  const b = UNIT[book];
  if (!a || !b || a.dim !== b.dim) return null;
  return ((qty * a.base) / b.base) * looked.price;
}

export type MealCost = { total: number; priced: number; unpriced: number };

export function mealCost(
  ingredients: { name: string; amount: number | null; unit: string | null }[],
  familyPrices: Map<string, { unit_price: number; unit: string }>,
): MealCost {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const ing of ingredients) {
    if (isStaple(ing.name)) continue;
    const cost = ingredientCost(ing.name, ing.amount, ing.unit, familyPrices);
    if (cost == null) unpriced++;
    else {
      total += cost;
      priced++;
    }
  }
  return { total: Math.round(total * 100) / 100, priced, unpriced };
}
