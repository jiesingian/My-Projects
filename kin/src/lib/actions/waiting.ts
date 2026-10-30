"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { databaseError } from "@/lib/report-error";
import { isGrownUp } from "@/lib/roles";
import { sendPush } from "@/lib/push";
import type { ActionState } from "@/lib/actions/auth";

function revalidateWaiting() {
  revalidatePath("/wealth");
  revalidatePath("/planner");
}

const KEY = /^[a-z-]{3,20}-[0-9a-f-]{8,80}$/;

/** "Not now" (Jonathan, 29 October): put one of your own "Waiting on you"
 * items away for 30 days (waiting_snoozes, 20261029233000). The key is the
 * list's own; one for something gone matches nothing. */
export async function snoozeWaitingAction(itemKey: string): Promise<ActionState> {
  if (!KEY.test(itemKey)) return { error: "That isn't something on your list." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const today = familyDay(new Date(), await householdZone());
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  await supabase.from("waiting_snoozes").delete().eq("member_id", me.id).eq("item_key", itemKey);
  const { error } = await supabase.from("waiting_snoozes").insert({ member_id: me.id, family_id: me.family_id, item_key: itemKey, until });
  if (error) return { error: databaseError(error) };
  revalidateWaiting();
  return { error: null };
}

/** "Remind" on a shared goal's deposit (Jonathan, 29 October): one push to
 * the person still to put in this month, from a grown-up of the household. */
export async function remindDepositAction(goalId: string, memberId: string): Promise<ActionState & { sent?: number }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can send a reminder." };
  if (memberId === me.id) return { error: "That one is yours to put in." };
  const supabase = await createClient();
  const [{ data: goal }, { data: who }] = await Promise.all([
    supabase.from("goals").select("id, title").eq("id", goalId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("members").select("id, full_name").eq("id", memberId).eq("family_id", me.family_id).eq("status", "active").maybeSingle(),
  ]);
  if (!goal || !who) return { error: "That goal or person isn't in your household." };
  const from = me.full_name?.split(" ")[0] ?? "Someone";
  // The push's source is a row of its own (money_pushes, 20261030190000):
  // push_targets sends only what an event of the sender's warrants.
  const { data: push, error } = await supabase.from("money_pushes").insert({ family_id: me.family_id, created_by: me.id, what: "deposit", ref: goal.id, recipient: who.id }).select("id").single();
  if (error || !push) return { error: databaseError(error) };
  const sent = await sendPush({
    kind: "bills",
    source: push.id,
    memberIds: [who.id],
    title: `${goal.title}: this month's deposit`,
    body: `${from} is reminding you to put in your share this month.`,
    url: "/wealth?seg=assets",
    tag: `deposit-${goal.id}`,
  });
  // Nothing reached a phone (no device with Kin's notifications on, or
  // bill notifications off): say so rather than "Reminded ✓".
  const first = who.full_name?.split(" ")[0] ?? "They";
  if (sent === 0) return { error: `${first} has no phone with Kin's bill notifications on, so the reminder didn't reach them. Tell them in person or in Chat.` };
  return { error: null, sent };
}
