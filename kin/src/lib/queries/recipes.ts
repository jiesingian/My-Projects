import { createClient } from "@/lib/supabase/server";
import { RECIPES, type MealSlot } from "@/lib/recipes";
import type { MarketSection } from "@/lib/grocery";

export type RecipeView = {
  /** The shipped key, or the family row's id for one of their own. */
  id: string;
  key: string | null;
  familyRecipeId: string | null;
  name: string;
  slots: MealSlot[];
  serves: number;
  minutes: number | null;
  steps: string[];
  ingredients: { name: string; qty: number | null; unit: string | null; section: string }[];
  /** Whether this is the household's own, an edit of a shipped one, or as
   * Kin shipped it. */
  origin: "own" | "edited" | "shipped";
};

/** Every recipe available to the household: what Kin ships, with the
 * family's edits substituted in, plus anything they wrote themselves. */
export async function getRecipeBook(familyId: string): Promise<RecipeView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("family_recipes")
    .select("*, family_recipe_ingredients(name, qty, unit, section, position)")
    .eq("family_id", familyId)
    .order("name");

  const rows = data ?? [];
  const editedKeys = new Set(rows.map((r) => r.base_key).filter((k): k is string => !!k));

  const own: RecipeView[] = rows.map((r) => ({
    id: r.id,
    key: r.base_key,
    familyRecipeId: r.id,
    name: r.name,
    slots: (r.slots ?? []) as MealSlot[],
    serves: r.serves,
    minutes: r.minutes,
    steps: r.steps ?? [],
    ingredients: (r.family_recipe_ingredients ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((ing) => ({ name: ing.name, qty: ing.qty == null ? null : Number(ing.qty), unit: ing.unit, section: ing.section })),
    origin: r.base_key ? "edited" : "own",
  }));

  const shipped: RecipeView[] = RECIPES.filter((r) => !editedKeys.has(r.key)).map((r) => ({
    id: r.key,
    key: r.key,
    familyRecipeId: null,
    name: r.name,
    slots: r.slots,
    serves: r.serves,
    minutes: r.minutes,
    steps: r.steps,
    ingredients: r.ingredients.map((ing) => ({ name: ing.name, qty: ing.qty, unit: ing.unit, section: ing.section as MarketSection })),
    origin: "shipped",
  }));

  return [...own, ...shipped].sort((a, b) => a.name.localeCompare(b.name));
}
