"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { getMemberScores } from "@/lib/queries/routines";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { isGrownUp } from "@/lib/roles";
import type { ActionState } from "@/lib/actions/auth";

/** Setting the price of things is a grown-up's job, or the whole economy is
 * whatever the child says it is. */
export async function addRewardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can add a reward." };

  const title = clamp(String(formData.get("title") ?? ""), 100);
  const cost = Number(String(formData.get("cost_points") ?? ""));
  if (!title) return { error: "Give the reward a name." };
  if (!(cost > 0 && cost <= 10000)) return { error: "The cost has to be between 1 and 10000 points." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards")
    .insert({ family_id: me.family_id, title, cost_points: Math.round(cost), created_by: me.id });
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/planner");
  return { error: null };
}

/** Retired, not deleted: a redemption from last month still has to be able
 * to say what it was for. */
export async function retireRewardAction(rewardId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can take a reward off the list." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards")
    .update({ active: false })
    .eq("id", rewardId)
    .eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/planner");
  return { error: null };
}

/** Asking for a reward. Anyone may ask for themselves; a grown-up may ask on
 * a child's behalf, which is how a younger one who cannot read the screen
 * still gets to spend what they earned.
 *
 * The cost is read from the reward here and written onto the request, so a
 * later change of price cannot rewrite what somebody already spent. */
export async function redeemRewardAction(rewardId: string, forMemberId?: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  let memberId = me.id;
  if (forMemberId && forMemberId !== me.id) {
    if (!isGrownUp(me.role)) return { error: "You can only ask for a reward for yourself." };
    const { data: target } = await supabase.from("members").select("id").eq("id", forMemberId).eq("family_id", me.family_id).maybeSingle();
    if (!target) return { error: "That member isn't in your household." };
    memberId = target.id;
  }

  const { data: reward } = await supabase
    .from("rewards")
    .select("id, title, cost_points, active")
    .eq("id", rewardId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!reward || !reward.active) return { error: "That reward is no longer on the list." };

  // Checked against what is actually left, which already counts requests
  // still waiting -- otherwise the same points buy several things at once
  // and a grown-up is left to discover it one refusal at a time.
  const scores = await getMemberScores(me.family_id);
  const mine = scores.find((s) => s.id === memberId);
  if (!mine) return { error: "That member isn't in your household." };
  if (mine.spendable < reward.cost_points) {
    return { error: `Not enough points yet — ${reward.title} costs ${reward.cost_points}, and there ${mine.spendable === 1 ? "is" : "are"} ${mine.spendable} to spend.` };
  }

  const { error } = await supabase.from("reward_redemptions").insert({
    family_id: me.family_id,
    reward_id: reward.id,
    member_id: memberId,
    cost_points: reward.cost_points,
  });
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** A grown-up's answer on a request. Same rule as approving a chore: the
 * role comes from the session, never from the request, and the update is
 * scoped to rows still pending so two grown-ups answering at once cannot
 * overwrite each other. */
async function decideRedemption(redemptionId: string, status: "granted" | "refused"): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can answer a reward request." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("reward_redemptions")
    .update({ status, decided_by: me.id, decided_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", redemptionId)
    .eq("family_id", me.family_id)
    .eq("status", "pending");
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "That one has already been answered." };

  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

export async function grantRedemptionAction(redemptionId: string): Promise<ActionState> {
  return decideRedemption(redemptionId, "granted");
}

/** Refusing hands the points back, because a refused request stops counting
 * against the balance the moment it stops being pending. */
export async function refuseRedemptionAction(redemptionId: string): Promise<ActionState> {
  return decideRedemption(redemptionId, "refused");
}
