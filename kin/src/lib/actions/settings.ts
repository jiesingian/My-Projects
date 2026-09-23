"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { isNotificationKey } from "@/lib/notifications";
import { humanDatabaseError } from "@/lib/db-errors";
import { isCountryCode } from "@/lib/countries";
import { isCurrencyCode, isDateFormat, isWeekStart } from "@/lib/household-prefs";

export async function setThemeAction(theme: "light" | "dark" | "system"): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  // The cookie below is what this browser renders from, and it was being set
  // whether or not the row saved -- so the theme appeared to change here and
  // quietly reverted on the member's other devices.
  const { error } = await supabase.from("members").update({ theme }).eq("id", me.id);
  if (error) return { error: `That did not save. ${error.message}` };

  const cookieStore = await cookies();
  if (theme === "system") cookieStore.delete("kin-theme");
  else cookieStore.set("kin-theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365 });

  revalidatePath("/", "layout");
  return { error: null };
}

export async function setTextSizeAction(textSize: "small" | "default" | "large"): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ text_size: textSize }).eq("id", me.id);
  if (error) return { error: `That did not save. ${error.message}` };
  // The layout, not just this page: the root font-size is rendered there, so
  // revalidating /settings alone changed which segment looked selected and
  // left the actual type exactly as it was.
  revalidatePath("/", "layout");
  return { error: null };
}

export async function toggleNotificationAction(key: string, value: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  // A server action is a public endpoint, and notification_prefs is JSONB, so
  // an unchecked key lets a caller write anything -- and any amount of it --
  // into their own row. Only the switches we actually offer are accepted.
  if (!isNotificationKey(key)) return { error: "That is not a setting we offer." };

  const supabase = await createClient();
  const prefs = { ...(me.notification_prefs as Record<string, boolean>), [key]: value };
  const { error } = await supabase.from("members").update({ notification_prefs: prefs }).eq("id", me.id);
  if (error) return { error: `That did not save. ${error.message}` };
  revalidatePath("/settings");
  return { error: null };
}

export async function updateHouseholdNameAction(name: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can rename the household." };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the household a name." };
  if (trimmed.length > 80) return { error: "That name is too long — 80 characters at most." };

  const supabase = await createClient();
  // The family comes from the session, not from the caller. It used to be an
  // argument, which RLS refused to act on when it named someone else's
  // household -- but a refusal that matches no rows is not an error, so the
  // rename silently did nothing and still reported success.
  const { error } = await supabase.from("families").update({ name: trimmed }).eq("id", me.family_id);
  revalidatePath("/settings");
  revalidatePath("/today");
  return { error: error ? humanDatabaseError(error.message) : null };
}

export async function updateHouseholdPrefsAction(
  currency: string,
  dateFormat: string,
  weekStart: string,
  country: string,
): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can change household preferences." };
  // Each select only ever offers a fixed list -- same reasoning as
  // account_type's server-side check: a form field is a request, not a
  // fact. Only `country` was checked, and the other three went straight
  // through: none of them has a CHECK constraint behind it, so a
  // 2,000-character "currency" was accepted and then prefixed to every
  // amount in the household, on every screen, for everybody. Date format
  // and week start failed more quietly -- an unrecognised value falls back
  // to a default, so the save reported success and the household kept being
  // shown a preference it had not chosen.
  if (!isCurrencyCode(currency)) return { error: "That isn't a currency we offer." };
  if (!isDateFormat(dateFormat)) return { error: "That isn't a date format we offer." };
  if (!isWeekStart(weekStart)) return { error: "A week starts on a Monday or a Sunday." };
  // Blank is allowed here and only here: a household that skipped country at
  // setup can leave it unset, and everything that reads it treats null as
  // "not stated". An unrecognized value is still refused.
  if (country && !isCountryCode(country)) return { error: "That isn't a country we recognize." };

  const supabase = await createClient();
  // Same reasoning as the rename above: the household is the caller's own,
  // taken from the session rather than accepted as an argument.
  const { error } = await supabase
    .from("families")
    .update({ currency, date_format: dateFormat, week_start: weekStart, country: country || null })
    .eq("id", me.family_id);
  revalidatePath("/settings");
  return { error: error ? humanDatabaseError(error.message) : null };
}
