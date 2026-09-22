"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { isGrownUp } from "@/lib/roles";
import type { ActionState } from "@/lib/actions/auth";

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

  // Only writes a row that is already sharing. Without the filter, a stale
  // tab that kept a timer running could switch sharing back on minutes
  // after somebody deliberately turned it off.
  const { data, error } = await supabase
    .from("member_locations")
    .update({ lat, lng, accuracy_m: accuracy, updated_at: new Date().toISOString() })
    .eq("member_id", me.id)
    .eq("sharing", true)
    .select("member_id")
    .maybeSingle();
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data) return { error: null };

  revalidatePath("/family");
  return { error: null };
}
