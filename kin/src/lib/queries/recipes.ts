import { createClient } from "@/lib/supabase/server";
import { RECIPES, RECIPE_CATEGORIES, guessCategories, type MealSlot, type RecipeCategory } from "@/lib/recipes";
import type { MarketSection } from "@/lib/grocery";
import { getSignedUrls } from "@/lib/storage";
import { recipeRef, RECIPE_PHOTO_BUCKET } from "@/lib/meal-photos";

export type RecipeView = {
  /** The shipped key, or the family row's id for one of their own. */
  id: string;
  key: string | null;
  familyRecipeId: string | null;
  name: string;
  slots: MealSlot[];
  /** What kind of food it is — what the book is browsed by. */
  categories: RecipeCategory[];
  serves: number;
  minutes: number | null;
  steps: string[];
  ingredients: { name: string; qty: number | null; unit: string | null; section: string }[];
  /** The household's own photo of the dish, if they have taken one. */
  photoUrl: string | null;
  /** Whether this is the household's own, an edit of a shipped one, or as
   * Kin shipped it. */
  origin: "own" | "edited" | "shipped";
};

/** Every recipe available to the household: what Kin ships, with the
 * family's edits substituted in, plus anything they wrote themselves. */
export async function getRecipeBook(familyId: string): Promise<RecipeView[]> {
  const supabase = await createClient();
  const [{ data }, { data: photos }] = await Promise.all([
    supabase
      .from("family_recipes")
      .select("*, family_recipe_ingredients(name, qty, unit, section, position)")
      .eq("family_id", familyId)
      .order("name"),
    supabase.from("recipe_photos").select("recipe_ref, storage_path").eq("family_id", familyId),
  ]);

  const rows = data ?? [];
  const editedKeys = new Set(rows.map((r) => r.base_key).filter((k): k is string => !!k));
  const photoOf = new Map((photos ?? []).map((p) => [p.recipe_ref, p.storage_path]));

  const own: RecipeView[] = rows.map((r) => {
    const ingredients = (r.family_recipe_ingredients ?? [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((ing) => ({ name: ing.name, qty: ing.qty == null ? null : Number(ing.qty), unit: ing.unit, section: ing.section }));
    const stated = (r.categories ?? []).filter((c): c is RecipeCategory => (RECIPE_CATEGORIES as string[]).includes(c));
    return {
      id: r.id,
      key: r.base_key,
      familyRecipeId: r.id,
      name: r.name,
      slots: (r.slots ?? []) as MealSlot[],
      // Nobody should have to file their own recipe before it can be found.
      categories: stated.length > 0 ? stated : guessCategories(r.name, ingredients.map((i) => i.name)),
      serves: r.serves,
      minutes: r.minutes,
      steps: r.steps ?? [],
      ingredients,
      photoUrl: null,
      origin: r.base_key ? "edited" : "own",
    };
  });

  const shipped: RecipeView[] = RECIPES.filter((r) => !editedKeys.has(r.key)).map((r) => ({
    id: r.key,
    key: r.key,
    familyRecipeId: null,
    name: r.name,
    slots: r.slots,
    categories: r.categories,
    serves: r.serves,
    minutes: r.minutes,
    steps: r.steps,
    ingredients: r.ingredients.map((ing) => ({ name: ing.name, qty: ing.qty, unit: ing.unit, section: ing.section as MarketSection })),
    photoUrl: null,
    origin: "shipped",
  }));

  const all = [...own, ...shipped].sort((a, b) => a.name.localeCompare(b.name));

  // A photo is of the dish, so it is found by the same name a planned meal
  // uses — one signing round trip for the whole book.
  const refOf = new Map(all.map((r) => [r, recipeRef({ dish: r.name })] as const));
  const paths = Array.from(new Set(Array.from(refOf.values()).map((ref) => photoOf.get(ref)).filter((p): p is string => !!p)));
  const signed = await getSignedUrls(RECIPE_PHOTO_BUCKET, paths);
  for (const r of all) {
    const path = photoOf.get(refOf.get(r)!);
    r.photoUrl = path ? (signed[path] ?? null) : null;
  }

  return all;
}
