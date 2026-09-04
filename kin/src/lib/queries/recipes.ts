import { createClient } from "@/lib/supabase/server";
import {
  RECIPES,
  RECIPE_CATEGORIES,
  RECIPE_CATEGORY_ICON,
  RECIPE_CATEGORY_LABEL,
  RECIPE_CATEGORY_PLATE,
  guessCategories,
  type MealSlot,
} from "@/lib/recipes";
import type { IconName } from "@/components/icons";
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
  /** What kind of food it is — what the book is browsed by. Either one Kin
   * ships or one the household added, which is only ever a stored key. */
  categories: string[];
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

export type CategoryView = {
  key: string;
  label: string;
  icon: IconName;
  /** Which glaze its tile wears. */
  plate: number;
  /** Whether the household added it themselves — the ones they can remove. */
  own: boolean;
};

/** The categories the recipe book is browsed by: the ones Kin ships, then
 * whatever the household has added. */
export async function getRecipeCategories(familyId: string): Promise<CategoryView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("family_recipe_categories")
    .select("key, label, plate")
    .eq("family_id", familyId)
    .order("created_at");

  return [
    ...RECIPE_CATEGORIES.map((c) => ({
      key: c as string,
      label: RECIPE_CATEGORY_LABEL[c],
      icon: RECIPE_CATEGORY_ICON[c],
      plate: RECIPE_CATEGORY_PLATE[c],
      own: false,
    })),
    ...(data ?? []).map((r) => ({ key: r.key, label: r.label, icon: "utensils" as IconName, plate: r.plate, own: true })),
  ];
}

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
    const stated = (r.categories ?? []).filter((c) => c.trim() !== "");
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
