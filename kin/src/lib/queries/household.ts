import { createClient } from "@/lib/supabase/server";
import { normalizeKey } from "@/lib/pricebook";
import { sectionOrder } from "@/lib/grocery";

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

export async function getMeals(familyId: string) {
  const supabase = await createClient();
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const [{ data: meals }, { data: activeBuy }] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("*, meal_ingredients(*)")
      .eq("family_id", familyId)
      .gte("plan_date", startOfWeek.toISOString().slice(0, 10))
      .lt("plan_date", endOfWeek.toISOString().slice(0, 10))
      .order("plan_date")
      .order("position"),
    supabase.from("buy_items").select("name").eq("family_id", familyId).eq("cleared", false).eq("checked", false),
  ]);

  // What is already in the house never needs buying, so it is neither
  // missing nor on the list — the third state the old count could not show.
  const { data: pantry } = await supabase.from("pantry_items").select("item_key").eq("family_id", familyId);
  const atHome = new Set((pantry ?? []).map((p) => p.item_key));
  const openNames = new Set((activeBuy ?? []).map((b) => normalizeKey(b.name)));

  return (meals ?? []).map((m) => {
    const ingredients = (m.meal_ingredients ?? []).map((i) => {
      const key = i.item_key ?? normalizeKey(i.ingredient_name);
      return {
        name: i.ingredient_name,
        qty: i.qty,
        key,
        inPantry: atHome.has(key),
        onList: openNames.has(key),
      };
    });
    return {
      ...m,
      ingredients,
      /** Not in the house and not yet on the shopping list. */
      missing: ingredients.filter((i) => !i.inPantry && !i.onList).length,
      have: ingredients.filter((i) => i.inPantry).length,
      ingredientCount: ingredients.length,
    };
  });
}
