"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";

export async function setThemeAction(theme: "light" | "dark" | "system") {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  await supabase.from("members").update({ theme }).eq("id", me.id);

  const cookieStore = await cookies();
  if (theme === "system") cookieStore.delete("kin-theme");
  else cookieStore.set("kin-theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365 });

  revalidatePath("/", "layout");
}

export async function setTextSizeAction(textSize: "small" | "default" | "large") {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  await supabase.from("members").update({ text_size: textSize }).eq("id", me.id);
  revalidatePath("/settings");
}

export async function toggleNotificationAction(key: string, value: boolean) {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const prefs = { ...(me.notification_prefs as Record<string, boolean>), [key]: value };
  await supabase.from("members").update({ notification_prefs: prefs }).eq("id", me.id);
  revalidatePath("/settings");
}

export async function updateHouseholdNameAction(familyId: string, name: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organiser can rename the household." };

  const supabase = await createClient();
  const { error } = await supabase.from("families").update({ name }).eq("id", familyId);
  revalidatePath("/settings");
  revalidatePath("/today");
  return { error: error?.message ?? null };
}

export async function updateHouseholdPrefsAction(familyId: string, currency: string, dateFormat: string, weekStart: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organiser can change household preferences." };

  const supabase = await createClient();
  const { error } = await supabase.from("families").update({ currency, date_format: dateFormat, week_start: weekStart }).eq("id", familyId);
  revalidatePath("/settings");
  return { error: error?.message ?? null };
}
