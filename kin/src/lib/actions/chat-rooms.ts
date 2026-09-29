"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { sendChatPush } from "@/lib/push";
import { pairOf } from "@/lib/queries/chat-rooms";
import type { ActionState } from "@/lib/actions/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Thread = "family" | `dm:${string}` | `link:${string}`;

/** Opening a conversation is reading it. Kept per person, so it follows them
 * to whichever household they are in. */
export async function markThreadReadAction(thread: Thread): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (thread !== "family" && !/^(dm|link):/.test(thread)) return { error: null };
  if (thread !== "family" && !UUID.test(thread.split(":")[1] ?? "")) return { error: null };
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_reads")
    .upsert({ person_id: me.person_id, thread, last_read_at: new Date().toISOString() }, { onConflict: "person_id,thread" });
  return error ? { error: humanDatabaseError(error.message) } : { error: null };
}

/** A message to everyone in the family tree: this household and each one
 * linked with it. Who wrote it and from where is set by the database. */
export async function sendFamilyMessageAction(body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const text = clamp(body.trim(), 2000);
  if (!text) return { error: "Write something first." };
  const supabase = await createClient();
  const { error } = await supabase.from("family_tree_messages").insert({ body: text });
  if (error) return { error: humanDatabaseError(error.message) };
  await markThreadReadAction("family");
  revalidatePath("/chat", "layout");
  // One tag per household tree, so a busy evening is one notification that
  // updates rather than a stack.
  after(() =>
    sendChatPush("family", { title: `${me.full_name.split(" ")[0]} · Family`, body: text, url: "/chat/family", tag: `family-tree-${me.family_id}` }),
  );
  return { error: null };
}

export async function deleteFamilyMessageAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("family_tree_messages").delete().eq("id", id).eq("member_id", me.id).select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That message isn't yours to delete." };
  revalidatePath("/chat", "layout");
  return { error: null };
}

/** One to one, to someone you are connected with. The database refuses it
 * otherwise (direct_messages_insert). */
export async function sendDirectMessageAction(otherPersonId: string, body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(otherPersonId)) return { error: "That conversation doesn't exist." };
  const text = clamp(body.trim(), 2000);
  if (!text) return { error: "Write something first." };
  const [person_low, person_high] = pairOf(me.person_id, otherPersonId);
  const supabase = await createClient();
  const { error } = await supabase.from("direct_messages").insert({ person_low, person_high, body: text });
  if (error) {
    if (error.code === "42501") return { error: "You're no longer connected, so this can't be sent." };
    return { error: humanDatabaseError(error.message) };
  }
  await markThreadReadAction(`dm:${otherPersonId}`);
  revalidatePath("/chat", "layout");
  after(() =>
    sendChatPush(`dm:${otherPersonId}`, { title: me.full_name.split(" ")[0], body: text, url: `/chat/dm/${me.person_id}`, tag: `dm-${person_low}-${person_high}` }),
  );
  return { error: null };
}

export async function deleteDirectMessageAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("direct_messages").delete().eq("id", id).eq("sender_person_id", me.person_id).select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That message isn't yours to delete." };
  revalidatePath("/chat", "layout");
  return { error: null };
}
