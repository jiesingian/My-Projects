"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";

/** Add or remove one of the household's own special days (a late Palace
 * proclamation, a town fiesta). Grown-ups only -- the table's own rules say
 * so too (20260930171000_household_special_days.sql). */
export async function addSpecialDayAction(day: string, name: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can add a special day." };
  const title = name.trim().slice(0, 80);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a date." };
  if (!title) return { error: "Give the day a name." };
  const supabase = await createClient();
  const { error } = await supabase.from("household_special_days").insert({ family_id: me.family_id, day, name: title, created_by: me.id });
  if (error) return { error: error.code === "23505" ? "That day is already on the list." : "It didn't save. Try again." };
  revalidatePath("/settings/household");
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

export async function removeSpecialDayAction(id: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can remove a special day." };
  const supabase = await createClient();
  const { error } = await supabase.from("household_special_days").delete().eq("id", id).eq("family_id", me.family_id);
  if (error) return { error: "It didn't remove. Try again." };
  revalidatePath("/settings/household");
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}
