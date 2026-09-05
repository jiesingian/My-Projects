"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";

const MAX_LENGTH = 4000;

/** Say something to the household. Mentions are passed as member ids the
 * composer resolved, not parsed back out of the text — a name is not a
 * reliable key, and two people here can share one. */
export async function sendMessageAction(input: { body: string; mentions?: string[] }): Promise<ActionState & { id?: string }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const body = input.body.trim().slice(0, MAX_LENGTH);
  if (!body) return { error: "Nothing to send." };

  // Only people in this household can be tagged, whatever the client sent.
  const { data: family } = await supabase.from("members").select("id").eq("family_id", me.family_id);
  const known = new Set((family ?? []).map((m) => m.id));
  const mentions = Array.from(new Set(input.mentions ?? [])).filter((id) => known.has(id));

  const { data, error } = await supabase
    .from("family_messages")
    .insert({ family_id: me.family_id, member_id: me.id, body, mentions })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "That didn't send." };

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

  const { error } = await supabase
    .from("family_messages")
    .update({ deleted_at: new Date().toISOString(), body: "", mentions: [] })
    .eq("id", messageId)
    .eq("family_id", me.family_id)
    .eq("member_id", me.id);
  if (error) return { error: error.message };

  revalidatePath("/chat");
  return { error: null };
}

/** Edit your own message. */
export async function editMessageAction(messageId: string, body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const next = body.trim().slice(0, MAX_LENGTH);
  if (!next) return { error: "A message can't be empty — delete it instead." };

  const { error } = await supabase
    .from("family_messages")
    .update({ body: next, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("family_id", me.family_id)
    .eq("member_id", me.id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  revalidatePath("/chat");
  return { error: null };
}

/** React to a message, change the reaction, or take it back by tapping the
 * one already there. One each per person, as everywhere else. */
export async function reactToMessageAction(messageId: string, emoji: string | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (!emoji) {
    const { error } = await supabase.from("family_message_reactions").delete().eq("message_id", messageId).eq("member_id", me.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("family_message_reactions")
      .upsert({ message_id: messageId, member_id: me.id, family_id: me.family_id, emoji }, { onConflict: "message_id,member_id" });
    if (error) return { error: error.message };
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
  if (error) return { error: error.message };
  return { error: null };
}
