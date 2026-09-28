"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { familyDay } from "@/lib/time";
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
    .upsert({ family_id: me.family_id, item_key: itemKey, day: familyDay(), state, marked_by: me.id }, { onConflict: "family_id,item_key,day" });
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/today");
  return { error: null };
}

export async function unmarkTodayItemAction(itemKey: string): Promise<ActionState> {
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

  const { error } = await supabase.from("today_marks").delete().eq("family_id", me.family_id).eq("item_key", itemKey).eq("day", familyDay());
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/today");
  return { error: null };
}
