"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGrownUp } from "@/lib/roles";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { isNotificationKey } from "@/lib/notifications";
import { humanDatabaseError } from "@/lib/db-errors";
import { isCountryCode } from "@/lib/countries";
import { TEXT_SCALE_MAX, TEXT_SCALE_MIN } from "@/lib/text-scale";
import { PALETTE_DEFAULT, PALETTE_NEW_MEMBER, isPaletteId } from "@/lib/palettes";
import { randomToken, sha256, toBase64Url } from "@/lib/security/crypto";
import { isCurrencyCode, isDateFormat, isWeekStart } from "@/lib/household-prefs";
import { MENU_MAX, WIDGET_MAX, cleanActions } from "@/lib/quick-button";
import { buildBrief, type BriefItem, type BriefRoutine } from "@/lib/brief";
import { familyDay } from "@/lib/time";

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

/** Whether new journal entries and milestones reach linked households on
 * their own (the share_new_memory trigger reads this). Off means each one is
 * shared by hand, as it was before 25 September. Nothing already written
 * changes either way. */
export async function updateShareWithRelativesAction(on: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!me.is_organiser) return { error: "Only the organizer can change what the household shares." };
  const supabase = await createClient();
  const { error } = await supabase.from("families").update({ share_with_relatives: on === true }).eq("id", me.family_id);
  revalidatePath("/settings", "layout");
  revalidatePath("/journal");
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** Kid view on or off for one child with a login of their own (K1). Only a
 * grown-up asks; the database refuses anyone else too (members_guard_kid_view),
 * so this check is for a clear message, not the protection. */
export async function setKidViewAction(memberId: string, on: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can change kid view." };
  const supabase = await createClient();
  const { data: child } = await supabase.from("members").select("id, family_id, role").eq("id", memberId).maybeSingle();
  if (!child || child.family_id !== me.family_id) return { error: "That person could not be found." };
  if (child.role !== "child_self") return { error: "Kid view is for children with a login of their own." };
  const { data: saved, error } = await supabase.from("members").update({ kid_view: on === true }).eq("id", memberId).select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  // A policy that refuses an update matches no rows rather than erroring.
  if (!saved || saved.length === 0) return { error: "That didn't save. Try again, or ask the household's organizer." };
  revalidatePath("/settings", "layout");
  return { error: null };
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

/** Which Kin actions the member wants in the Action Button's pop-up and on
 * the Home Screen widget (quick-button.ts). Only Kin's own actions are kept,
 * so the /go links can only ever send the member to one of Kin's pages. */
export async function setQuickButtonAction(prefs: { menu: string[]; widget: string[] }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const menu = cleanActions(prefs.menu, MENU_MAX);
  const widget = cleanActions(prefs.widget, WIDGET_MAX);
  if (!menu || !widget) return { error: `Pick at least one, and at most ${MENU_MAX}.` };
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ quick_actions: { menu, widget } }).eq("id", me.id);
  if (error) return { error: `That did not save. ${humanDatabaseError(error.message)}` };
  revalidatePath("/settings");
  return { error: null };
}

/** Makes the member a new private "Today in Kin" link, the one an iPhone
 * Shortcut fetches and reads aloud, replacing any earlier one. Separate from
 * the calendar link so making one never breaks the other. Like that link,
 * only the hash is stored: this is the one moment it exists readable. */
export async function createBriefLinkAction(): Promise<{ error: string | null; url?: string }> {
  const me = await requireCurrentMember();
  const token = randomToken();
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ brief_hash: toBase64Url(sha256(token)) }).eq("id", me.id);
  if (error) return { error: `That did not save. ${humanDatabaseError(error.message)}` };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  revalidatePath("/settings", "layout");
  return { error: null, url: `https://${host}/api/brief/${token}` };
}

/** Turns the "Today in Kin" link off. The Shortcut then says the link isn't
 * working any more. */
export async function removeBriefLinkAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("members").update({ brief_hash: null }).eq("id", me.id);
  if (error) return { error: `That did not save. ${humanDatabaseError(error.message)}` };
  revalidatePath("/settings", "layout");
  return { error: null };
}

/** What "Today in Kin" would say right now, for the Hear it button in
 * Settings -- read as the member through row-level security, with the same
 * reach as the link: whole-family items and the ones tagged to them, today's
 * chores and routines, and for grown-ups what is running low. */
export async function previewBriefAction(): Promise<{ text: string }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const today = familyDay();
  const [{ data: acts }, { data: evs }, { data: rts }, { data: pantry }, { data: buy }] = await Promise.all([
    supabase.from("activities").select("title, start_at, end_at, repeat, location, applies_to_whole_family, activity_members(member_id)").eq("family_id", me.family_id).or(`repeat.neq.once,start_at.gt.${since}`),
    supabase.from("events").select("title, event_date, end_date, recurs_yearly, applies_to_whole_family, event_members(member_id)").eq("family_id", me.family_id),
    supabase
      .from("routines")
      .select("id, title, freq, repeat_interval, byweekday, bymonthday, start_date, end_date, time_of_day, location, applies_to_whole_family, rotate_assignee, routine_members(member_id, position), routine_log(occurrence_date, status)")
      .eq("family_id", me.family_id)
      .eq("paused", false)
      .eq("routine_log.occurrence_date", today),
    isGrownUp(me.role) ? supabase.from("pantry_items").select("name").eq("family_id", me.family_id).eq("running_low", true) : Promise.resolve({ data: [] as { name: string }[] }),
    isGrownUp(me.role) ? supabase.from("buy_items").select("name").eq("family_id", me.family_id).eq("checked", false).eq("cleared", false) : Promise.resolve({ data: [] as { name: string }[] }),
  ]);
  const onList = new Set((buy ?? []).map((b) => b.name.trim().toLowerCase()));
  const low = (pantry ?? []).map((p) => p.name).filter((n) => !onList.has(n.trim().toLowerCase())).sort();
  const routines: BriefRoutine[] = (rts ?? []).map((r) => ({
    title: r.title,
    freq: r.freq as BriefRoutine["freq"],
    repeat_interval: r.repeat_interval,
    byweekday: r.byweekday,
    bymonthday: r.bymonthday,
    start_date: r.start_date,
    end_date: r.end_date,
    time_of_day: r.time_of_day,
    location: r.location,
    whole_family: r.applies_to_whole_family,
    rotate: r.rotate_assignee,
    members: [...(r.routine_members ?? [])].sort((a, b) => a.position - b.position).map((m) => m.member_id),
    logged: (r.routine_log ?? []).filter((l) => l.status === "done" || l.status === "skipped").map((l) => l.occurrence_date),
  }));
  const mine = (whole: boolean, tagged: { member_id: string }[] | null) => whole || (tagged ?? []).some((t) => t.member_id === me.id);
  const items: BriefItem[] = [
    ...(acts ?? [])
      .filter((a) => mine(a.applies_to_whole_family, a.activity_members))
      .map((a) => ({ title: a.title, starts_at: a.start_at, ends_at: a.end_at, all_day: null, all_day_end: null, yearly: false, repeat: a.repeat, location: a.location })),
    ...(evs ?? [])
      .filter((e) => mine(e.applies_to_whole_family, e.event_members))
      .map((e) => ({ title: e.title, starts_at: null, ends_at: null, all_day: e.event_date, all_day_end: e.end_date, yearly: e.recurs_yearly, repeat: null, location: null })),
  ];
  return { text: buildBrief(me.full_name, items, new Date(), undefined, { me: me.id, routines, low }) };
}
