"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars } from "@/lib/actions/calendar-sync";
import { MARKET_SECTIONS, guessSection, parseQuantity } from "@/lib/grocery";
import type { ActionState } from "@/lib/actions/auth";
import type { TablesInsert } from "@/lib/database.types";

export async function addBuyItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const sectionRaw = String(formData.get("section") ?? "").trim();
  const source = String(formData.get("source") ?? "house");
  if (!name) return { error: "Name the item." };

  // An empty section means the member didn't pick one — file it themselves.
  const section = (MARKET_SECTIONS as readonly string[]).includes(sectionRaw) ? sectionRaw : guessSection(name);

  const { error } = await supabase.from("buy_items").insert({
    family_id: me.family_id,
    name,
    quantity: quantityRaw ? Number(quantityRaw) : null,
    unit,
    section,
    source,
    created_by: me.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

export async function updateBuyItemAction(
  itemId: string,
  input: { name: string; quantity: number | null; unit: string | null; section: string },
): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  if (!input.name.trim()) return { error: "Name the item." };

  const { error } = await supabase
    .from("buy_items")
    .update({
      name: input.name.trim(),
      quantity: input.quantity,
      unit: input.unit,
      section: (MARKET_SECTIONS as readonly string[]).includes(input.section) ? input.section : "Other",
    })
    .eq("id", itemId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  revalidatePath("/household");
  return { error: null };
}

export async function removeBuyItemAction(itemId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("buy_items").delete().eq("id", itemId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidatePath("/household");
  return { error: null };
}

export async function toggleBuyItemAction(itemId: string, checked: boolean) {
  const supabase = await createClient();
  await supabase
    .from("buy_items")
    .update({ checked, checked_at: checked ? new Date().toISOString() : null })
    .eq("id", itemId);
  revalidatePath("/household");
}

export async function clearCheckedAction(familyId: string) {
  const supabase = await createClient();
  await supabase
    .from("buy_items")
    .update({ cleared: true, cleared_at: new Date().toISOString() })
    .eq("family_id", familyId)
    .eq("checked", true)
    .eq("cleared", false);
  revalidatePath("/household");
}

export async function addMealPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const date = String(formData.get("date") ?? "");
  const dish = String(formData.get("dish") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const ingredients = String(formData.get("ingredients") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!date || !dish) return { error: "Date and dish are required." };

  const { data: plan, error } = await supabase
    .from("meal_plans")
    .insert({ family_id: me.family_id, plan_date: date, dish, note, created_by: me.id })
    .select()
    .single();
  if (error) return { error: error.message };

  if (ingredients.length > 0) {
    await supabase.from("meal_ingredients").insert(
      ingredients.map((ingredient_name) => ({ meal_plan_id: plan.id, family_id: me.family_id, ingredient_name })),
    );
  }

  await syncRowToCalendars(me.family_id, "meal_plans", plan.id, { title: dish, startAt: new Date(`${date}T00:00:00`), allDay: true }, { kind: "all" });

  revalidatePath("/household");
  redirect("/household?seg=meals");
}

export async function generateGroceryListAction(familyId: string, createdBy: string) {
  const supabase = await createClient();
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const [{ data: meals }, { data: openBuy }] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("meal_ingredients(ingredient_name, qty)")
      .eq("family_id", familyId)
      .gte("plan_date", startOfWeek.toISOString().slice(0, 10))
      .lt("plan_date", endOfWeek.toISOString().slice(0, 10)),
    supabase.from("buy_items").select("name").eq("family_id", familyId).eq("cleared", false),
  ]);

  const existing = new Set((openBuy ?? []).map((b) => b.name.toLowerCase()));
  const seen = new Set<string>();
  const toInsert: TablesInsert<"buy_items">[] = [];

  for (const meal of meals ?? []) {
    for (const ing of meal.meal_ingredients ?? []) {
      const key = ing.ingredient_name.toLowerCase();
      if (existing.has(key) || seen.has(key)) continue;
      seen.add(key);
      const { quantity, unit } = parseQuantity(ing.qty);
      toInsert.push({
        family_id: familyId,
        name: ing.ingredient_name,
        quantity,
        unit,
        // Filed by name so a generated list already reads in market order.
        section: guessSection(ing.ingredient_name),
        source: "meal_plan",
        created_by: createdBy,
      });
    }
  }

  if (toInsert.length > 0) {
    await supabase.from("buy_items").insert(toInsert);
  }

  revalidatePath("/household");
  return toInsert.length;
}
