import { createClient } from "@/lib/supabase/server";
import { normalizeKey } from "@/lib/pricebook";
import { sectionOrder } from "@/lib/grocery";
import { getSignedUrls } from "@/lib/storage";
import { recipeRef, RECIPE_PHOTO_BUCKET } from "@/lib/meal-photos";
import { RECIPES_BY_KEY, type MealSlot } from "@/lib/recipes";

/** The open list, grouped by market section and ordered the way the sections
 * are walked, so it can be shopped straight down. */
export async function getBuyItems(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("buy_items")
    .select("*")
    .eq("family_id", familyId)
    .eq("cleared", false)
    // A list built from the week's meals is inserted in one statement, so
    // fifteen rows share a created_at to the microsecond. Ordering on that
    // alone leaves ties, and Postgres is free to return tied rows in any
    // order — which reshuffled the list on every save. Name breaks the tie,
    // and id breaks a repeated name.
    .order("created_at")
    .order("name")
    .order("id");
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

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Everything cooked on one day, with the amounts each meal needs and the
 * household's photo of each dish. One day is all the meal plan shows, so one
 * day is all this loads. */
export async function getMealsForDay(familyId: string, anchor: Date = new Date()) {
  const supabase = await createClient();
  const anchorISO = toISO(anchor);

  const [{ data: dayRows }, { data: activeBuy }, { data: pantry }, { data: photos }] = await Promise.all([
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

  return { meals, anchorISO };
}
