import { guessSection, parseQuantity } from "@/lib/grocery";
import { normalizeKey } from "@/lib/pricebook";
import { isStaple } from "@/lib/pantry-match";
import { weekdayOf } from "@/lib/time";

/** Meals and the shopping list (7 October, Janine's roadmap).
 *
 * Picking a meal puts its missing ingredients on the list: whatever is not in
 * the pantry, merged with what is already there by item and unit, and each
 * line remembers how much each meal added (buy_item_meals). Removing a meal
 * takes back only that meal's share.
 *
 * Both directions are worked out here, as plain data, so the rules can be
 * tested without a database; the actions only carry the answer out. */

export type MealIngredientRow = {
  ingredient_name: string;
  item_key: string | null;
  qty: string | null;
  qty_amount: number | string | null;
  unit: string | null;
  section: string | null;
};

/** An open line on the list: not ticked, not cleared. */
export type OpenLine = { id: string; name: string; quantity: number | string | null; unit: string | null; source: string };

export type Link = { buy_item_id: string; meal_plan_id: string; quantity: number | string | null };

/** One line is one item in one unit: 0.1 kg of garlic and 0.05 kg of garlic
 * are one line; a kilo of rice and a sack of rice are two. */
export function lineKey(name: string, unit: string | null): string {
  return `${normalizeKey(name)}|${(unit ?? "").trim().toLowerCase()}`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: number | string | null) => (v == null || v === "" ? null : Number(v));

export type AddPlan = {
  /** Lines already on the list that grow. */
  grow: { id: string; quantity: number | null }[];
  /** New lines, each with the meals it is for. */
  create: { name: string; quantity: number | null; unit: string | null; section: string; meals: { mealId: string; quantity: number | null }[] }[];
  /** Links for the lines that grew. Lines in `create` carry their own. */
  links: { buy_item_id: string; meal_plan_id: string; quantity: number | null }[];
};

/** What the list needs for these meals.
 *
 * Skipped: staples (salt, water, oil -- see pantry-match), anything in the
 * pantry, anything the household wrote on the list by hand (it is already
 * there, in the amount they chose), and any meal-and-line pair already
 * linked, so running this twice for a meal adds nothing the second time. */
export function planAdd(
  meals: { id: string; ingredients: MealIngredientRow[] }[],
  open: OpenLine[],
  existingLinks: Link[],
  atHome: Set<string>,
): AddPlan {
  const byLine = new Map<string, OpenLine>();
  const byHand = new Set<string>();
  for (const line of open) {
    if (line.source === "meal_plan") {
      if (!byLine.has(lineKey(line.name, line.unit))) byLine.set(lineKey(line.name, line.unit), line);
    } else byHand.add(normalizeKey(line.name));
  }
  const linkedMeals = new Map<string, Set<string>>();
  for (const l of existingLinks) {
    const line = open.find((o) => o.id === l.buy_item_id);
    if (!line) continue;
    const set = linkedMeals.get(l.meal_plan_id) ?? new Set<string>();
    set.add(lineKey(line.name, line.unit));
    linkedMeals.set(l.meal_plan_id, set);
  }

  const grow = new Map<string, { id: string; quantity: number | null }>();
  const links = new Map<string, { buy_item_id: string; meal_plan_id: string; quantity: number | null }>();
  const create = new Map<string, AddPlan["create"][number]>();

  for (const meal of meals) {
    const done = linkedMeals.get(meal.id) ?? new Set<string>();
    for (const ing of meal.ingredients) {
      const key = ing.item_key ?? normalizeKey(ing.ingredient_name);
      if (isStaple(ing.ingredient_name) || atHome.has(key) || byHand.has(key)) continue;
      const parsed = parseQuantity(ing.qty);
      const quantity = num(ing.qty_amount) ?? parsed.quantity;
      const unit = ing.unit ?? parsed.unit;
      const lk = lineKey(ing.ingredient_name, unit);
      if (done.has(lk)) continue;

      const line = byLine.get(lk);
      if (line) {
        const g = grow.get(line.id) ?? { id: line.id, quantity: num(line.quantity) };
        g.quantity = g.quantity == null || quantity == null ? (g.quantity ?? quantity) : round(g.quantity + quantity);
        grow.set(line.id, g);
        const l = links.get(`${line.id}|${meal.id}`) ?? { buy_item_id: line.id, meal_plan_id: meal.id, quantity: null };
        l.quantity = l.quantity == null ? quantity : quantity == null ? l.quantity : round(l.quantity + quantity);
        links.set(`${line.id}|${meal.id}`, l);
        continue;
      }

      const c = create.get(lk) ?? {
        name: ing.ingredient_name.trim(),
        quantity: null,
        unit,
        // Filed by name so a list built from meals already reads in market order.
        section: ing.section ?? guessSection(ing.ingredient_name),
        meals: [],
      };
      c.quantity = c.quantity == null ? quantity : quantity == null ? c.quantity : round(c.quantity + quantity);
      const share = c.meals.find((m) => m.mealId === meal.id);
      if (share) share.quantity = share.quantity == null ? quantity : quantity == null ? share.quantity : round(share.quantity + quantity);
      else c.meals.push({ mealId: meal.id, quantity });
      create.set(lk, c);
    }
  }

  return { grow: [...grow.values()], create: [...create.values()], links: [...links.values()] };
}

/** A line this meal is linked to, with what is known about everyone else. */
export type LinkedLine = {
  id: string;
  quantity: number | string | null;
  source: string;
  checked: boolean;
  cleared: boolean;
  /** What this meal added. */
  share: number | string | null;
  /** How many other meals the line is also for. */
  others: number;
};

/** What removing a meal does to the list: a line only it needed goes; a line
 * other meals share shrinks by its share. A line already in the basket or
 * cleared is history and is left alone, and so is anything the household
 * wrote by hand. */
export function planRemove(lines: LinkedLine[]): { remove: string[]; shrink: { id: string; quantity: number | null }[] } {
  const remove: string[] = [];
  const shrink: { id: string; quantity: number | null }[] = [];
  for (const line of lines) {
    if (line.checked || line.cleared || line.source !== "meal_plan") continue;
    if (line.others === 0) {
      remove.push(line.id);
      continue;
    }
    const quantity = num(line.quantity);
    const share = num(line.share);
    if (quantity == null || share == null) continue;
    const left = round(quantity - share);
    shrink.push({ id: line.id, quantity: left > 0 ? left : null });
  }
  return { remove, shrink };
}

/** "Tue" -- the day a meal is for, on its label. */
export function mealDayLabel(isoDate: string): string {
  const dow = weekdayOf(isoDate);
  return dow === null ? "" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
}
