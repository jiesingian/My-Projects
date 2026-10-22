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
import { recipesByPerson, type PersonRecipe } from "@/lib/recipe-person";
import { reportError } from "@/lib/report-error";

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
  /** The page a recipe was read from (Save a recipe from a link). */
  sourceUrl: string | null;
  /** Whose recipe it is: somebody on the tree (20261019152700). */
  personId: string | null;
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
      sourceUrl: r.source_url ?? null,
      personId: r.tree_person_id ?? null,
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
    sourceUrl: null,
    personId: null,
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

/** The household's recipes that name somebody on the tree, by person
 * (20261019152700), for their panel, profile and stories page. An empty map
 * when the read fails: the recipes are an extra there, never the point. */
export async function getRecipesByPerson(familyId: string): Promise<Map<string, PersonRecipe[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("family_recipes").select("id, name, tree_person_id").eq("family_id", familyId).not("tree_person_id", "is", null);
  if (error) reportError("recipes by person could not be read", error);
  return recipesByPerson(data ?? []);
}

/** Everyone on the household's tree, by the name the household has for
 * them, for a recipe's "Whose recipe" (20261019152700). */
export async function getRecipePeople(familyId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const [{ data: people }, { data: members }] = await Promise.all([
    supabase.from("family_tree_people").select("id, full_name, member_id").eq("family_id", familyId),
    supabase.from("members").select("id, full_name").eq("family_id", familyId),
  ]);
  const memberName = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  return (people ?? [])
    .map((p) => ({ id: p.id, name: (p.member_id ? memberName.get(p.member_id) : null) ?? p.full_name ?? "Unnamed" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
