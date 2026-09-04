import { createClient } from "@/lib/supabase/server";
import { normalizeKey } from "@/lib/pricebook";
import { sectionOrder } from "@/lib/grocery";
import { getSignedUrls } from "@/lib/storage";
import { recipeRef, RECIPE_PHOTO_BUCKET } from "@/lib/meal-photos";
import { MEAL_SLOTS, RECIPES_BY_KEY, type MealSlot } from "@/lib/recipes";

/** The open list, grouped by market section and ordered the way the sections
 * are walked, so it can be shopped straight down. */
export async function getBuyItems(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("buy_items")
    .select("*")
    .eq("family_id", familyId)
    .eq("cleared", false)
    .order("created_at");
  const items = data ?? [];

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const list = groups.get(item.section) ?? [];
    list.push(item);
    groups.set(item.section, list);
  }

  return {
    items,
    groups: Array.from(groups.entries())
      .sort((a, b) => sectionOrder(a[0]) - sectionOrder(b[0]))
      .map(([name, groupItems]) => ({
        name,
        items: groupItems,
        openCount: groupItems.filter((i) => !i.checked).length,
      })),
    openCount: items.filter((i) => !i.checked).length,
    doneCount: items.filter((i) => i.checked).length,
  };
}

export type PlannedIngredient = {
  id: string;
  name: string;
  /** What the recipe said, as free text — kept for anything an amount and a
   * unit can't hold ("to taste", "a handful"). */
  qty: string | null;
  amount: number | null;
  unit: string | null;
  key: string;
  inPantry: boolean;
  onList: boolean;
};

export type PlannedMeal = {
  id: string;
  dish: string;
  slot: MealSlot;
  planDate: string;
  note: string | null;
  recipeKey: string | null;
  familyRecipeId: string | null;
  /** The dish's own name for its photo — see recipeRef. */
  ref: string;
  photoUrl: string | null;
  minutes: number | null;
  serves: number | null;
  steps: string[];
  ingredients: PlannedIngredient[];
  missing: number;
  have: number;
  ingredientCount: number;
};

export type MealDay = {
  date: Date;
  iso: string;
  isToday: boolean;
  isSelected: boolean;
  /** Just enough to draw the rail: one dot per meal, coloured by slot. */
  slots: MealSlot[];
};

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The meal plan around one day: a rail of dates that can be scrolled and
 * tapped, and everything cooked on the selected one. Mirrors the Planner's
 * week agenda deliberately — the same gesture should move both.
 *
 * The rail spans thirteen weeks; only the chosen day is loaded in full,
 * because that is the only one whose ingredients and photos are on screen. */
export async function getMealPlanner(familyId: string, anchor: Date = new Date(), stripWeeksEachSide = 6) {
  const supabase = await createClient();
  const today = new Date();

  const startOfWeek = new Date(anchor);
  startOfWeek.setDate(anchor.getDate() - anchor.getDay());
  const stripStart = new Date(startOfWeek);
  stripStart.setDate(startOfWeek.getDate() - 7 * stripWeeksEachSide);
  const stripLength = 7 * (stripWeeksEachSide * 2 + 1);
  const stripEnd = new Date(stripStart);
  stripEnd.setDate(stripStart.getDate() + stripLength);

  const anchorISO = toISO(anchor);

  const [{ data: railRows }, { data: dayRows }, { data: activeBuy }, { data: pantry }, { data: photos }] = await Promise.all([
    supabase.from("meal_plans").select("plan_date, slot").eq("family_id", familyId).gte("plan_date", toISO(stripStart)).lt("plan_date", toISO(stripEnd)),
    supabase
      .from("meal_plans")
      .select("*, meal_ingredients(*), family_recipes(minutes, serves, steps)")
      .eq("family_id", familyId)
      .eq("plan_date", anchorISO)
      .order("position"),
    supabase.from("buy_items").select("name").eq("family_id", familyId).eq("cleared", false).eq("checked", false),
    supabase.from("pantry_items").select("item_key").eq("family_id", familyId),
    supabase.from("recipe_photos").select("recipe_ref, storage_path").eq("family_id", familyId),
  ]);

  const atHome = new Set((pantry ?? []).map((p) => p.item_key));
  const openNames = new Set((activeBuy ?? []).map((b) => normalizeKey(b.name)));

  const bySlot = new Map<string, MealSlot[]>();
  for (const r of railRows ?? []) {
    const list = bySlot.get(r.plan_date) ?? [];
    list.push(r.slot as MealSlot);
    bySlot.set(r.plan_date, list);
  }

  const strip: MealDay[] = Array.from({ length: stripLength }, (_, i) => {
    const d = new Date(stripStart);
    d.setDate(stripStart.getDate() + i);
    const iso = toISO(d);
    const slots = bySlot.get(iso) ?? [];
    return {
      date: d,
      iso,
      isToday: d.toDateString() === today.toDateString(),
      isSelected: iso === anchorISO,
      // In the order they are eaten, so the dots read left to right as a day.
      slots: MEAL_SLOTS.filter((s) => slots.includes(s)),
    };
  });

  const photoOf = new Map((photos ?? []).map((p) => [p.recipe_ref, p.storage_path]));
  const rows = dayRows ?? [];
  const wanted = Array.from(new Set(rows.map((m) => photoOf.get(recipeRef(m))).filter((p): p is string => !!p)));
  const signed = await getSignedUrls(RECIPE_PHOTO_BUCKET, wanted);

  const meals: PlannedMeal[] = rows.map((m) => {
    const shipped = m.recipe_key ? RECIPES_BY_KEY.get(m.recipe_key) : undefined;
    const own = m.family_recipes;
    const ingredients: PlannedIngredient[] = (m.meal_ingredients ?? [])
      .map((i) => {
        const key = i.item_key ?? normalizeKey(i.ingredient_name);
        return {
          id: i.id,
          name: i.ingredient_name,
          qty: i.qty,
          amount: i.qty_amount == null ? null : Number(i.qty_amount),
          unit: i.unit,
          key,
          inPantry: atHome.has(key),
          onList: openNames.has(key),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const ref = recipeRef(m);
    const path = photoOf.get(ref);

    return {
      id: m.id,
      dish: m.dish,
      slot: m.slot as MealSlot,
      planDate: m.plan_date,
      note: m.note,
      recipeKey: m.recipe_key,
      familyRecipeId: m.family_recipe_id,
      ref,
      photoUrl: path ? (signed[path] ?? null) : null,
      minutes: own?.minutes ?? shipped?.minutes ?? null,
      serves: own?.serves ?? shipped?.serves ?? null,
      steps: own?.steps ?? shipped?.steps ?? [],
      ingredients,
      /** Not in the house and not yet on the shopping list. */
      missing: ingredients.filter((i) => !i.inPantry && !i.onList).length,
      have: ingredients.filter((i) => i.inPantry).length,
      ingredientCount: ingredients.length,
    };
  });

  return { strip, meals, anchorISO };
}
