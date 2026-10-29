"use server";

import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { FREE_AI_PER_MONTH, readAccess } from "@/lib/access";

/** How many Kin AI uses the household has left this month (29 October):
 * null on Kin Plus, where there is no limit. Read from ai_usage, the row
 * use_kin_ai() keeps per household and Manila month, so Ask Kin can say
 * "3 of 5 left" before a question rather than after the last one. Asked
 * when Ask Kin opens, not on every page. */
export async function kinAiLeftAction(): Promise<number | null> {
  const me = await requireCurrentMember();
  if (readAccess(me.families).plus) return null;
  const month = `${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 7)}-01`;
  const supabase = await createClient();
  const { data } = await supabase.from("ai_usage").select("uses").eq("family_id", me.family_id).eq("month", month).maybeSingle();
  return Math.max(0, FREE_AI_PER_MONTH - (data?.uses ?? 0));
}
