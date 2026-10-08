"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { isGrownUp } from "@/lib/roles";
import type { ActionState } from "@/lib/actions/auth";
import { after } from "next/server";
import { sendPush } from "@/lib/push";
import { placeAt, arrivalAt, PAUSE_HOURS, type SavedPlace } from "@/lib/location-places";
import { familyClock, familyDay, familyInstant, addDays } from "@/lib/time";

/** Sharing where you are is the person's own decision, so the only member
 * anybody can switch on is themselves -- with one exception, which is a
 * managed child's profile. That profile has no login and no phone; a
 * grown-up keeps it, and if a grown-up cannot enrol it then it can never
 * appear on the board at all.
 *
 * Row-level security says the same thing, and that is the version that
 * counts: a signed-in member holds the anon key and can call PostgREST
 * directly, so these checks are here to produce a sentence a person can
 * read, not to keep anybody out. */
export async function setLocationSharingAction(memberId: string, on: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (memberId !== me.id) {
    const { data: target } = await supabase
      .from("members")
      .select("id, role")
      .eq("id", memberId)
      .eq("family_id", me.family_id)
      .maybeSingle();
    if (!target) return { error: "That family member wasn't found." };
    // A child with their own phone decides for themselves; a grown-up only
    // allows it (setChildLocationOkAction), never switches it on for them.
    if (!isGrownUp(me.role) || target.role !== "child_managed") {
      return { error: "Only that person can choose to share where they are." };
    }
  }

  // Switching off clears the position in the same statement. Leaving the
  // last one behind would mean "not sharing" still answered the question,
  // and a check constraint refuses the row anyway.
  const { error } = await supabase.from("member_locations").upsert(
    on
      ? { member_id: memberId, family_id: me.family_id, sharing: true }
      : { member_id: memberId, family_id: me.family_id, sharing: false, lat: null, lng: null, accuracy_m: null, updated_at: null },
    { onConflict: "member_id" },
  );
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/family");
  return { error: null };
}

/** A position only ever comes from the device of the person it belongs to,
 * so this takes no member id -- it writes the caller's own row or nothing.
 * Out-of-range numbers are refused rather than clamped: a clamped
 * coordinate is a confident pin in the wrong place, which is worse than no
 * pin at all. */
export async function reportMyLocationAction(lat: number, lng: number, accuracyM: number | null): Promise<ActionState> {
  const me = await requireCurrentMember();

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "That reading didn't look like a real position." };
  }
  const accuracy =
    accuracyM !== null && Number.isFinite(accuracyM) && accuracyM >= 0
      ? Math.min(10_000_000, Math.round(accuracyM))
      : null;

  const supabase = await createClient();

  // Only writes a row that is already sharing and not paused. Without the
  // filter, a stale tab that kept a timer running could put a position back
  // minutes after somebody deliberately turned it off or paused it.
  const nowIso = new Date().toISOString();
  const [{ data: current }, { data: placeRows }] = await Promise.all([
    supabase.from("member_locations").select("place_id, sharing, paused_until").eq("member_id", me.id).maybeSingle(),
    supabase.from("household_places").select("id, name, lat, lng, radius_m, notify").eq("family_id", me.family_id),
  ]);
  if (!current?.sharing || (current.paused_until && current.paused_until > nowIso)) return { error: null };

  const places: SavedPlace[] = (placeRows ?? []).map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, radiusM: p.radius_m, notify: p.notify }));
  const here = placeAt(lat, lng, places, accuracy);
  const { data, error } = await supabase
    .from("member_locations")
    .update({ lat, lng, accuracy_m: accuracy, updated_at: nowIso, place_id: here?.id ?? null })
    .eq("member_id", me.id)
    .eq("sharing", true)
    .select("member_id")
    .maybeSingle();
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data) return { error: null };

  // "Ben arrived at School", once per arrival, to everyone else at home.
  const arrived = arrivalAt(current.place_id, here);
  if (arrived) {
    const first = me.full_name.split(" ")[0];
    const tz = me.families.time_zone;
    after(() =>
      sendPush({ kind: "arrivals", title: `${first} arrived at ${arrived.name}`, body: `At ${familyClock(new Date(), tz)}`, url: "/family?seg=quicklinks", tag: `arrive-${me.id}` }),
    );
  }

  revalidatePath("/family");
  revalidatePath("/today");
  return { error: null };
}

/** Pause your own sharing for a while: the position is cleared at once and
 * the phone stops reporting until the pause ends or you resume. `hours` is
 * one of PAUSE_HOURS, or "tomorrow" for 07:00 tomorrow in the household's
 * zone, or null to resume now. */
export async function pauseMyLocationAction(hours: number | "tomorrow" | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  let until: string | null = null;
  if (hours === "tomorrow") {
    const tz = me.families.time_zone;
    const tomorrow = addDays(familyDay(new Date(), tz), 1);
    until = (tomorrow && familyInstant(tomorrow, "07:00", tz)?.toISOString()) || null;
    if (!until) return { error: "That pause didn't work out. Try again." };
  } else if (hours !== null) {
    if (!(PAUSE_HOURS as readonly number[]).includes(hours)) return { error: "Pick how long to pause." };
    until = new Date(Date.now() + hours * 3_600_000).toISOString();
  }
  const { data, error } = await supabase
    .from("member_locations")
    .update(until ? { paused_until: until, lat: null, lng: null, accuracy_m: null, place_id: null } : { paused_until: null })
    .eq("member_id", me.id)
    .eq("sharing", true)
    .select("member_id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "You're not sharing your location." };
  revalidatePath("/family");
  revalidatePath("/today");
  return { error: null };
}

/** A grown-up allows (or stops allowing) a child with their own phone to
 * share. Allowing does not switch it on -- the child still chooses; taking
 * the okay back switches it off and clears the position (the database does
 * both, 20261007160000). */
export async function setChildLocationOkAction(memberId: string, ok: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another grown-up can do that." };
  const supabase = await createClient();
  const { data: child } = await supabase.from("members").select("id, role").eq("id", memberId).eq("family_id", me.family_id).maybeSingle();
  if (!child || child.role !== "child_self") return { error: "That's only for a child with their own login." };
  const { error } = await supabase
    .from("member_locations")
    .upsert(ok ? { member_id: memberId, family_id: me.family_id, parent_ok: true } : { member_id: memberId, family_id: me.family_id, parent_ok: false, sharing: false, lat: null, lng: null, accuracy_m: null, place_id: null }, { onConflict: "member_id" });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  revalidatePath("/today");
  return { error: null };
}

/** Save a place for the household (grown-ups), from a position the phone
 * just read. */
export async function addPlaceAction(input: { name: string; lat: number; lng: number; radiusM?: number }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can save places." };
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!name) return { error: "Name the place." };
  const { lat, lng } = input;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return { error: "That reading didn't look like a real position." };
  const radius = Math.min(2000, Math.max(50, Math.round(input.radiusM ?? 150)));
  const supabase = await createClient();
  const { error } = await supabase.from("household_places").insert({ family_id: me.family_id, name, lat, lng, radius_m: radius, created_by: me.id });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  return { error: null };
}

export async function setPlaceNotifyAction(placeId: string, notify: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("household_places").update({ notify }).eq("id", placeId).eq("family_id", me.family_id).select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "Only a grown-up can change places." };
  revalidatePath("/family");
  return { error: null };
}

export async function removePlaceAction(placeId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("household_places").delete().eq("id", placeId).eq("family_id", me.family_id).select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "Only a grown-up can remove places." };
  revalidatePath("/family");
  return { error: null };
}
