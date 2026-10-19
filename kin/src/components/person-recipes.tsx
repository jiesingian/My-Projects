import Link from "next/link";
import { Icon } from "@/components/icons";
import { recipeHref, type PersonRecipe } from "@/lib/recipe-person";

/** "Lola's recipes" (20261019152700): the household's recipes that name
 * this person, each opening in the Meals tab's book. On their panel on the
 * tree, their profile and their stories page; nothing when there are none. */
export function PersonRecipes({ recipes, firstName }: { recipes: PersonRecipe[]; firstName: string }) {
  if (recipes.length === 0) return null;
  return (
    <section className="kin-person-recipes" aria-label={`${firstName}'s recipes`}>
      <div className="kin-person-recipes-head">
        <Icon name="utensils" size="1rem" /> {firstName}&rsquo;s recipes
      </div>
      <ul>
        {recipes.map((r) => (
          <li key={r.id}>
            <Link href={recipeHref(r.id)}>{r.name}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
