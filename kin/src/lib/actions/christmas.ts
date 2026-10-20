"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { inKidView } from "@/lib/kid-view";
import { isGrownUp } from "@/lib/roles";
import { familyDay } from "@/lib/time";
import { NOCHE_BUENA_DISHES, nocheBuenaDate, nocheBuenaToAdd } from "@/lib/christmas";
import { addMealFromRecipeAction } from "@/lib/actions/household";

/** "Plan Noche Buena" on Today (20261020212000): puts the chosen dishes on
 * the 24 December dinner through the meal plan, the way Meals does
 * (addMealFromRecipeAction), so their ingredients land on the To-Buy list by
 * the same path as any planned meal. Dishes already on that dinner are left
 * as they are; a grown-up, never kid view. */
export async function planNocheBuenaAction(keys: string[]): Promise<{ error: string | null; added: number }> {
  const me = await requireCurrentMember();
  if (inKidView(me) || !isGrownUp(me.role)) return { error: "Ask a grown-up to plan Noche Buena.", added: 0 };
  const chosen = (Array.isArray(keys) ? keys : []).filter((k): k is (typeof NOCHE_BUENA_DISHES)[number] => (NOCHE_BUENA_DISHES as readonly string[]).includes(k));
  if (chosen.length === 0) return { error: "Tick at least one dish.", added: 0 };
  const today = familyDay(new Date(), me.families.time_zone);
  const date = nocheBuenaDate(today);
  if (date < today) return { error: "Noche Buena has passed; see you next year.", added: 0 };
  const supabase = await createClient();
  const { data: planned } = await supabase.from("meal_plans").select("recipe_key, dish").eq("family_id", me.family_id).eq("plan_date", date).eq("slot", "dinner");
  const toAdd = nocheBuenaToAdd(chosen, planned ?? []);
  let added = 0;
  for (const key of toAdd) {
    try {
      const r = await addMealFromRecipeAction({ date, slot: "dinner", recipeKey: key });
      if (r.error) return { error: r.error, added };
    } catch (err) {
      // The meal and its shopping lines are written before the calendar sync,
      // which is the part that can throw (Google unreachable). Keep going if
      // the dish got in; stop and say so if it did not.
      const { data: saved } = await supabase.from("meal_plans").select("id").eq("family_id", me.family_id).eq("plan_date", date).eq("slot", "dinner").eq("recipe_key", key).limit(1);
      console.error("planNocheBuena: a dish's follow-up failed", { key, saved: !!saved?.length, reason: err instanceof Error ? err.message : String(err) });
      if (!saved?.length) return { error: "Kin couldn't plan that dish just now. Try again in a minute.", added };
    }
    added++;
  }
  revalidatePath("/today");
  revalidatePath("/household");
  return { error: null, added };
}
