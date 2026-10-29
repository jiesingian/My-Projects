"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";
import { isGrownUp } from "@/lib/roles";
import { clamp } from "@/lib/text";
import { isNextChoice } from "@/lib/next-vote";
import type { ActionState } from "@/lib/actions/auth";

/** One grown-up's answer to "What should Kin do next?", their own row only. */
export async function saveNextVoteAction(choice: string, note: string): Promise<ActionState> {
  if (!isNextChoice(choice)) return { error: "Pick one of the answers." };
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "This question is for the grown-ups." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("feature_votes")
    .upsert({ member_id: me.id, family_id: me.family_id, choice, note: clamp(String(note ?? "").trim(), 200) || null, updated_at: new Date().toISOString() }, { onConflict: "member_id" });
  if (error) return { error: databaseError(error) };
  revalidatePath("/today");
  return { error: null };
}
