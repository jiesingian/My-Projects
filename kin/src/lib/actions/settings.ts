"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { isNotificationKey } from "@/lib/notifications";
import { humanDatabaseError } from "@/lib/db-errors";
import { isCountryCode } from "@/lib/countries";
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN } from "@/lib/text-scale";
import { PALETTE_DEFAULT, PALETTE_NEW_MEMBER, isPaletteId } from "@/lib/palettes";
import { randomToken, sha256, toBase64Url } from "@/lib/security/crypto";
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

/** The member's text size, as a percentage. Saved and nothing more: the
 * settings page asks whether to restart, and the new size arrives with the next
 * load -- the model the member asked for, and the same one Telegram uses, so
 * the page does not rearrange itself under a thumb still on the slider. */
export async function setTextScaleAction(percent: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  const value = Math.round(Number(percent));
  if (!Number.isFinite(value) || value < TEXT_SCALE_MIN || value > TEXT_SCALE_MAX) {
    return { error: `Pick a size between ${TEXT_SCALE_MIN}% and ${TEXT_SCALE_MAX}%.` };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ text_scale: value }).eq("id", me.id);
  if (error) return { error: `That did not save. ${error.message}` };
  return { error: null };
}

/** The member's colour theme. Saved to their row, so it follows them to every
 * device, and to a cookie, so the root layout can switch a dark-only palette
 * into dark mode before anything paints. Like text size, the settings page
 * then asks whether to restart rather than repainting under the finger. */
export async function setPaletteAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isPaletteId(id)) return { error: "That is not one of the themes we offer." };
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ palette: id }).eq("id", me.id);
  if (error) return { error: `That did not save. ${humanDatabaseError(error.message)}` };
  const cookieStore = await cookies();
  if (id === PALETTE_DEFAULT) cookieStore.delete("kin-palette");
  else cookieStore.set("kin-palette", id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { error: null };
}

/** The one-time "try the new look" offer on Today, answered. Yes switches
 * this member to the icon's coral palette; either way the answer is kept, so
 * the offer does not come back on this device or another. */
export async function answerLookOfferAction(accept: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ look_offer_answered_at: new Date().toISOString(), ...(accept ? { palette: PALETTE_NEW_MEMBER } : {}) })
    .eq("id", me.id);
  if (error) return { error: `That did not save. ${humanDatabaseError(error.message)}` };
  if (accept) {
    const cookieStore = await cookies();
    cookieStore.set("kin-palette", PALETTE_NEW_MEMBER, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  revalidatePath("/today");
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
  revalidatePath("/settings", "layout");
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
  revalidatePath("/settings", "layout");
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
  revalidatePath("/settings", "layout");
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Makes the member a new private calendar link for Apple Calendar, Outlook
 * and the like, replacing any earlier one. Only the hash is stored, so this is
 * the one moment the link exists anywhere readable: it is returned to show
 * once, and a lost link is replaced, never recovered. */
export async function createCalendarFeedAction(): Promise<{ error: string | null; https?: string; webcal?: string }> {
  const me = await requireCurrentMember();
  const token = randomToken();
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ calendar_feed_hash: toBase64Url(sha256(token)) })
    .eq("id", me.id);
  if (error) return { error: `That did not save. ${humanDatabaseError(error.message)}` };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const path = `/api/calendar/feed/${token}.ics`;
  revalidatePath("/settings", "layout");
  return { error: null, https: `https://${host}${path}`, webcal: `webcal://${host}${path}` };
}

/** Turns the private calendar link off. Subscribed calendars stop updating. */
export async function removeCalendarFeedAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ calendar_feed_hash: null }).eq("id", me.id);
  if (error) return { error: `That did not save. ${humanDatabaseError(error.message)}` };
  revalidatePath("/settings", "layout");
  return { error: null };
}
