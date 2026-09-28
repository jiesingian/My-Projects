"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { UUID } from "@/lib/ids";

/** Reactions and comments on an entry in the family feed. Who may see and
 * write them is decided by the tables' policies
 * (20260929034700_feed_reactions_and_comments.sql): the entry's household and
 * the households linked with it. The database also sets who wrote each one,
 * so these actions pass only the entry and the words. */

// Kept in step with the table's check and with REACTIONS in
// components/feed-talk.tsx: a "use server" file may export only async functions.
const ALLOWED = new Set(["❤️", "😂", "😮", "😢", "👍", "🙏"]);
const COMMENT_MAX = 1000;

export async function setEntryReactionAction(entryId: string, emoji: string | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(entryId)) return { error: "That memory is no longer there." };
  const supabase = await createClient();
  if (emoji === null) {
    const { error } = await supabase.from("journal_reactions").delete().eq("entry_id", entryId).eq("member_id", me.id);
    if (error) return { error: humanDatabaseError(error.message) };
  } else {
    if (!ALLOWED.has(emoji)) return { error: "That reaction isn't one Kin offers." };
    const { error } = await supabase
      .from("journal_reactions")
      .upsert({ entry_id: entryId, family_id: me.family_id, member_id: me.id, emoji }, { onConflict: "entry_id,member_id" });
    if (error) return { error: humanDatabaseError(error.message) };
  }
  revalidatePath("/journal");
  return { error: null };
}

export async function addEntryCommentAction(entryId: string, body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(entryId)) return { error: "That memory is no longer there." };
  const text = clamp(body.trim(), COMMENT_MAX);
  if (!text) return { error: "Write something first." };
  const supabase = await createClient();
  const { error } = await supabase.from("journal_comments").insert({ entry_id: entryId, family_id: me.family_id, member_id: me.id, body: text });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/journal");
  return { error: null };
}

export async function deleteEntryCommentAction(commentId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(commentId)) return { error: "That comment is no longer there." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("journal_comments").delete({ count: "exact" }).eq("id", commentId);
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "Only whoever wrote it, or the household whose memory it is, can remove it." };
  revalidatePath("/journal");
  return { error: null };
}
