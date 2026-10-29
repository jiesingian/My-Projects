"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";

const KINDS = new Set(["activity", "appointment", "bill"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Switches one plan, check-up or bill to ring as a real alarm in the Kin
 * iPhone app, for the member alone, or back to a plain reminder
 * (alarm_picks, 20261029100000; lib/alarms.ts). */
export async function setAlarmPickAction(kind: string, itemId: string, on: boolean): Promise<{ error: string | null }> {
  if (!KINDS.has(kind) || !UUID.test(itemId)) return { error: "That isn't something Kin can ring for." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = on
    ? await supabase.from("alarm_picks").upsert({ member_id: me.id, family_id: me.family_id, kind, item_id: itemId }, { onConflict: "member_id,kind,item_id", ignoreDuplicates: true })
    : await supabase.from("alarm_picks").delete().eq("member_id", me.id).eq("kind", kind).eq("item_id", itemId);
  if (error) return { error: `That did not save. ${databaseError(error)}` };
  revalidatePath("/settings/notifications/alarms");
  return { error: null };
}
