"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { databaseError } from "@/lib/report-error";
import { UUID } from "@/lib/ids";
import { isGrownUp } from "@/lib/roles";
import { randomToken, sha256, toBase64Url } from "@/lib/security/crypto";

/** A guest link on an event (20261020231000_event_guest_links.sql): made,
 * pointed at a draw, and turned off by a grown-up of the host household.
 * The functions decide who may; these shape the call and say no in words.
 * Guests' own writes never come through here: they go through
 * api/guest/[token] with the link as the key. */

const refresh = () => revalidatePath("/planner");

/** Make (or replace) the event's guest link. The link is shown once: only
 * its hash is kept. */
export async function createEventGuestLinkAction(eventId: string, drawId: string | null): Promise<{ error: string | null; url?: string }> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId) || (drawId !== null && !UUID.test(drawId))) return { error: "That event could not be found." };
  if (!isGrownUp(me.role)) return { error: "Ask a grown-up to make the guest link." };
  const token = randomToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_guest_link", { p_event: eventId, p_token_hash: toBase64Url(sha256(token)), p_draw: drawId });
  if (error) return { error: databaseError(error) };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  refresh();
  return { error: null, url: `https://${host}/guest/${token}` };
}

/** Which of the household's draws the link's guests may put themselves in
 * (null for none), keeping the link itself. */
export async function setEventGuestLinkDrawAction(eventId: string, drawId: string | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId) || (drawId !== null && !UUID.test(drawId))) return { error: "That event could not be found." };
  if (!isGrownUp(me.role)) return { error: "Ask a grown-up to change the guest link." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_guest_link_draw", { p_event: eventId, p_draw: drawId });
  refresh();
  return { error: error ? databaseError(error) : null };
}

/** Turn the link off. Guests who answered stay on the event. */
export async function revokeEventGuestLinkAction(eventId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId)) return { error: "That event could not be found." };
  if (!isGrownUp(me.role)) return { error: "Ask a grown-up to turn the guest link off." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_event_guest_link", { p_event: eventId });
  refresh();
  return { error: error ? databaseError(error) : null };
}

/** Take a guest off the event: their answer, claims and place in the draw
 * go with them (not once the names are drawn; the policy refuses). */
export async function removeEventGuestAction(guestId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(guestId)) return { error: "That guest could not be found." };
  if (!isGrownUp(me.role)) return { error: "Ask a grown-up to take a guest off." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_guests").delete().eq("id", guestId).eq("family_id", me.family_id).select("id");
  refresh();
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "That guest can't be taken off now: the names are drawn, or they're not on your event." };
  return { error: null };
}
