"use server";

import { householdZone } from "@/lib/household-zone";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { familyDay, familyClock, familyInstant, addDays } from "@/lib/time";
import { syncRowToCalendars } from "@/lib/actions/calendar-sync";
import type { ActionState } from "@/lib/actions/auth";

/** Done or Skip on anything in Today's one list (approved 28 September).
 *
 * Chores keep their own log (routines.ts). Everything else is marked in
 * today_marks for the day, and where the thing has a state of its own, that
 * is set too, so the rest of Kin agrees:
 *
 * - a one-off plan: completed / cancelled (Planner stops showing it as to do)
 * - a check-up or vaccination: done means given
 * - a bill: only Skip is here; paying goes through Wealth's pay flow, which
 *   records the money leaving an account
 * - the shopping: the mark is all there is
 * - a birthday or an event: nothing to mark; it is the day, and it ends with it
 *
 * Undo puts both back. Every write is the member's own session, so row-level
 * security keeps it inside their household. */

const KEY = /^(activity|bill|health)-[0-9a-f-]{36}$|^buy$/;

export async function markTodayItemAction(itemKey: string, state: "done" | "skipped"): Promise<ActionState> {
  const tz = await householdZone();
  if (!KEY.test(itemKey) || (state !== "done" && state !== "skipped")) return { error: "That can't be marked." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const [kind, ...rest] = itemKey.split("-");
  const id = rest.join("-");

  if (kind === "bill" && state === "done") return { error: "Pay a bill from Wealth, so the money is recorded." };

  if (kind === "activity") {
    const { error } = await supabase
      .from("activities")
      .update({ status: state === "done" ? "completed" : "cancelled" })
      .eq("id", id)
      .eq("family_id", me.family_id);
    if (error) return { error: humanDatabaseError(error.message) };
  }
  if (kind === "health" && state === "done") {
    const { error } = await supabase.from("health_schedule").update({ status: "given" }).eq("id", id).eq("family_id", me.family_id);
    if (error) return { error: humanDatabaseError(error.message) };
  }

  const { error } = await supabase
    .from("today_marks")
    .upsert({ family_id: me.family_id, item_key: itemKey, day: familyDay(new Date(), tz), state, marked_by: me.id }, { onConflict: "family_id,item_key,day" });
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/today");
  return { error: null };
}

export async function unmarkTodayItemAction(itemKey: string): Promise<ActionState> {
  const tz = await householdZone();
  if (!KEY.test(itemKey)) return { error: "That can't be changed." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const [kind, ...rest] = itemKey.split("-");
  const id = rest.join("-");

  if (kind === "activity") {
    const { error } = await supabase.from("activities").update({ status: "upcoming" }).eq("id", id).eq("family_id", me.family_id);
    if (error) return { error: humanDatabaseError(error.message) };
  }
  if (kind === "health") {
    // Back to due; whether it was "due" or "due soon" before is not kept, and
    // due is the one that keeps it on Today.
    const { error } = await supabase.from("health_schedule").update({ status: "due" }).eq("id", id).eq("family_id", me.family_id).eq("status", "given");
    if (error) return { error: humanDatabaseError(error.message) };
  }

  const { error } = await supabase.from("today_marks").delete().eq("family_id", me.family_id).eq("item_key", itemKey).eq("day", familyDay(new Date(), tz));
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/today");
  return { error: null };
}

/** The evening wrap-up's one tap (lib/wrap-up.ts): today's open one-off plans
 * move to the same time tomorrow. Only plans still upcoming, starting today,
 * and not repeating -- moving a repeating one would move its whole series.
 * Each moved plan is re-synced to the calendars it was sent to. */
export async function moveOpenToTomorrowAction(activityIds: string[]): Promise<ActionState & { moved?: number; kept?: number }> {
  const ids = activityIds.filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 50);
  if (ids.length === 0) return { error: null, moved: 0, kept: 0 };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const today = familyDay();
  const { data: rows, error } = await supabase
    .from("activities")
    .select("id, title, start_at, end_at, location, repeat, status, applies_to_whole_family, activity_members(member_id)")
    .eq("family_id", me.family_id)
    .in("id", ids);
  if (error) return { error: humanDatabaseError(error.message) };

  let moved = 0;
  let kept = 0;
  for (const a of rows ?? []) {
    const start = new Date(a.start_at);
    if (a.status !== "upcoming" || familyDay(start) !== today || (a.repeat && a.repeat !== "once")) {
      kept++;
      continue;
    }
    const tomorrow = addDays(today, 1);
    const startAt = tomorrow ? familyInstant(tomorrow, familyClock(start)) : null;
    if (!startAt) {
      kept++;
      continue;
    }
    const shift = startAt.getTime() - start.getTime();
    const endAt = a.end_at ? new Date(new Date(a.end_at).getTime() + shift) : null;
    const { error: moveError } = await supabase
      .from("activities")
      .update({ start_at: startAt.toISOString(), end_at: endAt ? endAt.toISOString() : null })
      .eq("id", a.id)
      .eq("family_id", me.family_id);
    if (moveError) return { error: humanDatabaseError(moveError.message), moved, kept };
    moved++;
    await syncRowToCalendars(
      me.family_id,
      "activities",
      a.id,
      { title: a.title, startAt, endAt, location: a.location },
      a.applies_to_whole_family ? { kind: "all" } : { kind: "members", memberIds: (a.activity_members ?? []).map((m) => m.member_id) },
    );
  }

  revalidatePath("/today");
  revalidatePath("/planner");
  return { error: null, moved, kept: kept + (ids.length - (rows ?? []).length) };
}
