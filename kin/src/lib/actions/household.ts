"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars } from "@/lib/actions/calendar-sync";
import type { ActionState } from "@/lib/actions/auth";

export async function addBuyItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const qty = String(formData.get("qty") ?? "").trim() || null;
  const groupName = String(formData.get("group_name") ?? "").trim() || "Other";
  const source = String(formData.get("source") ?? "house");
  if (!name) return { error: "Name the item." };

  const { error } = await supabase.from("buy_items").insert({
    family_id: me.family_id,
    group_name: groupName,
    name,
    qty,
    source,
    created_by: me.id,
  });
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
  const toInsert: { family_id: string; group_name: string; name: string; qty: string | null; source: "meal_plan"; created_by: string }[] = [];

  for (const meal of meals ?? []) {
    for (const ing of meal.meal_ingredients ?? []) {
      const key = ing.ingredient_name.toLowerCase();
      if (existing.has(key) || seen.has(key)) continue;
      seen.add(key);
      toInsert.push({
        family_id: familyId,
        group_name: "From meal plan",
        name: ing.ingredient_name,
        qty: ing.qty,
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

export async function addBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "unpaid");
  if (!name || !amount) return { error: "Name and amount are required." };

  const { data: bill, error } = await supabase
    .from("bills")
    .insert({
      family_id: me.family_id,
      name,
      amount,
      due_date: dueDate,
      category,
      status,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  if (dueDate) {
    await syncRowToCalendars(me.family_id, "bills", bill.id, { title: `${name} due`, startAt: new Date(`${dueDate}T00:00:00`), allDay: true }, { kind: "all" });
  }

  revalidatePath("/household");
  return { error: null };
}

export async function markBillPaidAction(billId: string) {
  const supabase = await createClient();
  await supabase.from("bills").update({ status: "paid" }).eq("id", billId);
  revalidatePath("/household");
}
