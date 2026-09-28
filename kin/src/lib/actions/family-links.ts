"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { isGrownUp } from "@/lib/roles";
import { clamp } from "@/lib/text";
import { familyDay } from "@/lib/time";
import { occasionMilestoneTitle } from "@/lib/occasions";
import type { ActionState } from "@/lib/actions/auth";

/** Linking two households is the only thing in Kin that reaches past
 * family_id, so all three writes go through security-definer functions that
 * re-check the caller themselves. What is here is the wording: the database
 * raises in its own voice, and these turn that into a sentence somebody can
 * act on. */
function readable(message: string): string {
  if (message.includes("No household has that code")) return "No household has that code. Check it and try again.";
  if (message.includes("your own household")) return "That's your own code.";
  if (message.includes("not made to your household")) return "That request was made to a different household.";
  if (message.includes("no longer open")) return "That request has already been answered.";
  if (message.includes("not yours to change")) return "That link isn't yours to change.";
  if (message.includes("parent or another adult")) return "Only a parent or another adult can do that.";
  return "That didn't work. Try again in a moment.";
}

export async function requestFamilyLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can link households." };

  const code = clamp(String(formData.get("code") ?? "").trim(), 40);
  if (!code) return { error: "Enter the other household's code." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_family_link", { code });
  if (error) return { error: readable(error.message) };

  revalidatePath("/journal");
  return { error: null };
}

export async function respondFamilyLinkAction(linkId: string, accept: boolean): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_family_link", { link_id: linkId, accept });
  if (error) return { error: readable(error.message) };
  revalidatePath("/journal");
  return { error: null };
}

export async function revokeFamilyLinkAction(linkId: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_family_link", { link_id: linkId });
  if (error) return { error: readable(error.message) };
  revalidatePath("/journal");
  return { error: null };
}

/** A greeting under today's birthday or anniversary on the family feed. The
 * database decides everything but the words -- who it is from, which
 * household, which day, and whether this occasion is one the caller may greet
 * at all (20260928203000_feed_occasions.sql). */
export async function greetOccasionAction(eventId: string, body: string): Promise<ActionState> {
  await requireCurrentMember();
  const text = clamp(body.trim(), 500);
  if (!text) return { error: "Write a greeting first." };
  const supabase = await createClient();
  const { error } = await supabase.from("occasion_greetings").insert({ event_id: eventId, body: text });
  if (error) {
    // The one refusal a person can meet: the day ended, or the link closed.
    if (error.message.includes("event_family_id")) return { error: "That day has passed, so the greeting can't be sent." };
    return { error: humanDatabaseError(error.message) };
  }
  revalidatePath("/journal");
  return { error: null };
}

/** Mark today's birthday or anniversary a milestone, or take the mark back.
 * Only the household the occasion belongs to decides -- some birthdays are
 * milestones and most are not. It writes an ordinary milestone carrying the
 * event (20260929001000), so it lives on the Milestones tab afterwards. */
export async function setOccasionMilestoneAction(eventId: string, on: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const today = familyDay();
  if (!on) {
    const { error } = await supabase
      .from("milestones")
      .delete()
      .eq("event_id", eventId)
      .eq("milestone_date", today)
      .eq("family_id", me.family_id);
    if (error) return { error: humanDatabaseError(error.message) };
    revalidatePath("/journal");
    return { error: null };
  }
  // The occasion must be this household's own and today's; the function is
  // the same one the card itself was built from.
  const { data: occasions } = await supabase.rpc("feed_occasions_today");
  const o = (occasions ?? []).find((x) => x.event_id === eventId && x.is_ours);
  if (!o || (o.kind !== "birthday" && o.kind !== "anniversary")) return { error: "Only the family whose day it is can mark it a milestone." };
  const { error } = await supabase.from("milestones").insert({
    family_id: me.family_id,
    title: clamp(occasionMilestoneTitle(o.title, o.kind, o.years), 150),
    milestone_date: today,
    event_id: eventId,
    created_by: me.id,
  });
  // Marked twice (two taps, two phones): the unique index keeps one, and
  // that is the answer either way.
  if (error && !error.message.includes("milestones_event_day_idx")) return { error: humanDatabaseError(error.message) };
  revalidatePath("/journal");
  return { error: null };
}

/** Take back your own greeting; row-level security refuses anyone else's. */
export async function removeGreetingAction(greetingId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("occasion_greetings").delete().eq("id", greetingId).eq("member_id", me.id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/journal");
  return { error: null };
}

/** Sharing is per entry and opt-in. Nothing is shared by writing it, and
 * un-sharing takes effect on the next read rather than leaving a copy
 * anywhere -- the other household sees the row through a policy, so there is
 * nothing to withdraw. */
export async function setEntrySharedAction(entryId: string, shared: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("journal_entries")
    .update({ shared_at: shared ? new Date().toISOString() : null })
    .eq("id", entryId)
    .eq("family_id", me.family_id)
    // Only a household entry goes to the family feed; a personal one is added
    // to the household journal first.
    .eq("visibility", "household");
  if (error) return { error: "That memory couldn't be updated." };
  revalidatePath("/journal");
  return { error: null };
}

/** Put a milestone on the family feed, or take it off. The same switch a
 * journal entry has: private until somebody shares it, and then visible to
 * this household and every household it is linked to. */
export async function setMilestoneSharedAction(milestoneId: string, shared: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("milestones")
    .update({ shared_at: shared ? new Date().toISOString() : null })
    .eq("id", milestoneId)
    .eq("family_id", me.family_id);
  if (error) return { error: "That milestone couldn't be updated." };
  revalidatePath("/journal");
  return { error: null };
}

/** Say something to a linked household. The database checks the link is
 * accepted and that the message is this member's own; author_name is written
 * there too, from the sender's own identity. */
export async function sendLinkMessageAction(linkId: string, body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const text = body.trim().slice(0, 2000);
  if (!text) return { error: "Nothing to send." };
  const supabase = await createClient();
  const { error } = await supabase.from("family_link_messages").insert({ link_id: linkId, family_id: me.family_id, member_id: me.id, body: text });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath(`/journal/links/${linkId}`);
  return { error: null };
}

export async function deleteLinkMessageAction(messageId: string, linkId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("family_link_messages").delete().eq("id", messageId).eq("member_id", me.id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath(`/journal/links/${linkId}`);
  return { error: null };
}
