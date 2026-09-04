import { createClient } from "@/lib/supabase/server";
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
      .order("plan_date"),
    supabase.from("buy_items").select("name").eq("family_id", familyId).eq("cleared", false).eq("checked", false),
  ]);

  const openNames = new Set((activeBuy ?? []).map((b) => b.name.toLowerCase()));

  return (meals ?? []).map((m) => {
    const ingredients = m.meal_ingredients ?? [];
    const missing = ingredients.filter((i) => openNames.has(i.ingredient_name.toLowerCase())).length;
    return { ...m, missing, ingredientCount: ingredients.length };
  });
}
