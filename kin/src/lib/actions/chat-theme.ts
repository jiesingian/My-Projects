"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";
import { chatTheme, householdTopic } from "@/lib/chat-themes";

/** Sets the household chat's theme, for everyone in it. Whether the caller
 * may is the table's rule (chat_topic_is_mine); the topic is built here from
 * their own household, so this can only ever set their own chat's. */
export async function setHouseholdChatThemeAction(theme: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_themes")
    .upsert({ topic: householdTopic(me.family_id), theme: chatTheme(theme), set_by: me.id, updated_at: new Date().toISOString() });
  if (error) return { error: databaseError(error) };
  revalidatePath("/chat", "layout");
  return { error: null };
}
