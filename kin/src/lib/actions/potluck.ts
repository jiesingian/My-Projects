"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { databaseError } from "@/lib/report-error";
import { UUID } from "@/lib/ids";
import { isGrownUp } from "@/lib/roles";
import { inKidView } from "@/lib/kid-view";
import { POTLUCK_WANTED_MAX, parsePotluckItem } from "@/lib/potluck";

/** Potluck on an event (20261019233100_event_potluck.sql). The policies and
 * triggers decide who may do what -- the host household lists, anyone who
 * can see it claims in their own name, never past what is wanted; these
 * actions shape the rows and say no in words. */

const refresh = (eventId: string) => {
  revalidatePath("/planner");
  revalidatePath(`/planner/potluck/${eventId}`);
};

/** Add to the list: "Pancit x2" is two of Pancit. */
export async function addPotluckItemAction(eventId: string, text: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId)) return { error: "That event could not be found." };
  if (inKidView(me)) return { error: "Ask a grown-up to add to the list." };
  const parsed = parsePotluckItem(text);
  if (!parsed) return { error: "Write what is needed, like “Pancit x2”." };
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id, recurs_yearly").eq("id", eventId).eq("family_id", me.family_id).maybeSingle();
  if (!event) return { error: "That event is no longer there." };
  if (event.recurs_yearly) return { error: "A potluck is for one day, not a yearly event." };
  const { count } = await supabase.from("potluck_items").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  if ((count ?? 0) >= 60) return { error: "That's a long list already: 60 things at most." };
  const { error } = await supabase
    .from("potluck_items")
    .insert({ event_id: eventId, family_id: me.family_id, label: parsed.label, wanted: parsed.wanted, position: count ?? 0, created_by: me.id });
  refresh(eventId);
  return { error: error ? databaseError(error) : null };
}

export async function removePotluckItemAction(itemId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(itemId)) return { error: "That item could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("potluck_items").delete().eq("id", itemId).eq("family_id", me.family_id).select("event_id");
  if (data?.[0]) refresh(data[0].event_id);
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "Only the household having the event can change its list." };
  return { error: null };
}

/** "Ask linked households too": the host's grown-ups only. */
export async function setPotluckRelativesAction(eventId: string, on: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId)) return { error: "That event could not be found." };
  if (!isGrownUp(me.role)) return { error: "Ask a grown-up to change who is asked." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").update({ potluck_relatives: on === true }).eq("id", eventId).eq("family_id", me.family_id).select("id");
  refresh(eventId);
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "That event is no longer there." };
  return { error: null };
}

/** Bring `qty` of an item, in your own name; 0 takes the claim back. */
export async function claimPotluckAction(itemId: string, qty: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(itemId)) return { error: "That item could not be found." };
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n < 0 || n > POTLUCK_WANTED_MAX) return { error: "Choose how many you'll bring." };
  const supabase = await createClient();
  // Read under the item's own policy: an item you can't see isn't found.
  const { data: item } = await supabase.from("potluck_items").select("id, event_id, family_id").eq("id", itemId).maybeSingle();
  if (!item) return { error: "That item is no longer on the list." };
  const { data: mine } = await supabase.from("potluck_claims").select("id").eq("item_id", itemId).eq("member_id", me.id).maybeSingle();

  let error: { message: string } | null = null;
  let changed = true;
  if (n === 0) {
    if (mine) ({ error } = await supabase.from("potluck_claims").delete().eq("id", mine.id));
  } else if (mine) {
    const r = await supabase.from("potluck_claims").update({ qty: n }).eq("id", mine.id).select("id");
    error = r.error;
    changed = !!r.data?.length;
  } else {
    ({ error } = await supabase
      .from("potluck_claims")
      .insert({ item_id: itemId, event_id: item.event_id, event_family_id: item.family_id, member_id: me.id, family_id: me.family_id, qty: n }));
  }
  refresh(item.event_id);
  if (error) return { error: databaseError(error) };
  if (!changed) return { error: "This potluck is closed: the event is over." };
  return { error: null };
}
