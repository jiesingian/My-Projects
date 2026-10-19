/** Whose recipe it is (19 October; 20261019150000_recipe_tree_person):
 * "Lola's adobo". A recipe in the household's book can name somebody on
 * the tree -- a member, a relative who is only a name, someone who has
 * passed -- and then shows on their panel, their profile and their stories
 * page. The pure parts, tested alone (e2e/recipe-person.logic.spec.ts). */

export type PersonRecipe = { id: string; name: string };

/** "Lola Remedios's recipe" under a recipe's name. Empty when it is nobody's
 * or the person is no longer on the tree. */
export function whoseRecipeLabel(fullName: string | null | undefined): string {
  const name = (fullName ?? "").trim();
  return name ? `${name}'s recipe` : "";
}

/** Where a recipe opens: the Meals tab with the recipe book open at it. */
export function recipeHref(recipeId: string): string {
  return `/household?seg=meals&recipe=${encodeURIComponent(recipeId)}`;
}

/** Each person's recipes, by name, from the book's rows. */
export function recipesByPerson(rows: { id: string; name: string; tree_person_id: string | null }[]): Map<string, PersonRecipe[]> {
  const out = new Map<string, PersonRecipe[]>();
  for (const r of rows) {
    if (!r.tree_person_id) continue;
    out.set(r.tree_person_id, [...(out.get(r.tree_person_id) ?? []), { id: r.id, name: r.name }]);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** The short line under "Recipes" on a panel: "Adobo, Leche flan and 2 more". */
export function recipesLine(recipes: PersonRecipe[]): string {
  const names = recipes.map((r) => r.name);
  if (names.length === 0) return "";
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}
