"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";
import { isReaction } from "@/lib/chat";

const MAX_LENGTH = 4000;

/** Say something to the household. Mentions are passed as member ids the
 * composer resolved, not parsed back out of the text — a name is not a
 * reliable key, and two people here can share one. */
export async function sendMessageAction(input: { body: string; mentions?: string[]; replyTo?: string | null }): Promise<ActionState & { id?: string }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const body = input.body.trim().slice(0, MAX_LENGTH);
  if (!body) return { error: "Nothing to send." };

  // Only people in this household can be tagged, whatever the client sent.
  const { data: family } = await supabase.from("members").select("id").eq("family_id", me.family_id);
  const known = new Set((family ?? []).map((m) => m.id));
  const mentions = Array.from(new Set(input.mentions ?? [])).filter((id) => known.has(id));

  // A reply to a message in another household is refused by a trigger, not
  // here -- the browser holds the anon key, so this check is for the error
  // message and the database is for the rule.
  const replyTo = input.replyTo ?? null;

  const { data, error } = await supabase
    .from("family_messages")
    .insert({ family_id: me.family_id, member_id: me.id, body, mentions, reply_to: replyTo })
    .select("id")
    .single();
  if (error || !data) return { error: error ? humanDatabaseError(error.message) : "That didn't send." };

  // Sending is reading: the thread should not come back with your own words
  // waiting to be read.
  await markChatReadAction();

  revalidatePath("/chat");
  return { error: null, id: data.id };
}

/** Withdraw your own message. It leaves its place in the thread, so what was
 * said around it still follows. */
export async function deleteMessageAction(messageId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: removed, error } = await supabase
    .from("family_messages")
    .update({ deleted_at: new Date().toISOString(), body: "", mentions: [] })
    .eq("id", messageId)
    .eq("family_id", me.family_id)
    .eq("member_id", me.id)
    .select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!removed?.length) return { error: "That message isn't yours to withdraw." };

  revalidatePath("/chat");
  return { error: null };
}

/** Edit your own message. */
export async function editMessageAction(messageId: string, body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const next = body.trim().slice(0, MAX_LENGTH);
  if (!next) return { error: "A message can't be empty — delete it instead." };

  // `select()` so the count is knowable. Every filter here can legitimately
  // match nothing -- somebody else's message, one already withdrawn -- and a
  // PostgREST update that matches no rows is not an error, so without this the
  // action reported success and changed nothing. The same mistake
  // updateHouseholdNameAction was fixed for, and the one this file's own
  // cleanup script fell for while it was being written.
  const { data: edited, error } = await supabase
    .from("family_messages")
    .update({ body: next, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("family_id", me.family_id)
    .eq("member_id", me.id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!edited?.length) return { error: "That message can't be edited — it may have been withdrawn already." };

  revalidatePath("/chat");
  return { error: null };
}

/** React to a message, change the reaction, or take it back by tapping the
 * one already there. One each per person, as everywhere else. */
export async function reactToMessageAction(messageId: string, emoji: string | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  // Both arguments arrive from the caller and neither was checked. A reaction
  // is one of six things; the column has no CHECK behind it, so a sentence and
  // five thousand characters of X were both accepted and both then render in
  // the chip under that message for the whole household.
  if (emoji !== null && !isReaction(emoji)) return { error: "That isn't a reaction." };

  // And the message has to be one of ours. RLS is satisfied by the family_id
  // this sends -- which is the caller's own -- so it never had an opinion on
  // whether message_id belonged to that family, and a reaction could be filed
  // against another household's message. Nothing leaks either way (neither
  // side can see the other's rows) but it stores a row that means nothing and
  // tells the caller whether a message id exists, which is not theirs to ask.
  const { data: message, error: lookupError } = await supabase
    .from("family_messages")
    .select("id")
    .eq("id", messageId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (lookupError) return { error: humanDatabaseError(lookupError.message) };
  if (!message) return { error: "That message isn't in this household's thread." };

  if (!emoji) {
    const { error } = await supabase.from("family_message_reactions").delete().eq("message_id", messageId).eq("member_id", me.id);
    if (error) return { error: humanDatabaseError(error.message) };
  } else {
    const { error } = await supabase
      .from("family_message_reactions")
      .upsert({ message_id: messageId, member_id: me.id, family_id: me.family_id, emoji }, { onConflict: "message_id,member_id" });
    if (error) return { error: humanDatabaseError(error.message) };
  }

  revalidatePath("/chat");
  return { error: null };
}

/** Everything up to now has been seen. */
export async function markChatReadAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("family_message_reads")
    .upsert({ member_id: me.id, family_id: me.family_id, last_read_at: new Date().toISOString() }, { onConflict: "member_id" });
  if (error) return { error: humanDatabaseError(error.message) };
  return { error: null };
}

/** Pin a message, or move the pin to a different one. A household has one at a
 * time — the thing on the fridge door — so this replaces rather than appends,
 * which is also what makes unpinning unambiguous. */
export async function pinMessageAction(messageId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase
    .from("family_chat_pins")
    .upsert(
      { family_id: me.family_id, message_id: messageId, pinned_by: me.id, pinned_at: new Date().toISOString() },
      { onConflict: "family_id" },
    );
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/chat");
  return { error: null };
}

/** Take the pin down. Anyone in the household may: five people do not need a
 * moderator, and whoever notices it has gone stale is the right person. */
export async function unpinMessageAction(): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { error } = await supabase.from("family_chat_pins").delete().eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/chat");
  return { error: null };
}
