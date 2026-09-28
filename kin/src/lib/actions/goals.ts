"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { isGrownUp } from "@/lib/roles";
import { readAccess } from "@/lib/access";
import { familyDay } from "@/lib/time";
import { GOAL_KIND_META, isGoalKind, isGoalPeriod } from "@/lib/goals";

export type GoalFormState = { error: string | null; field?: string };

/** Setting a goal, and asking for its reward in the same breath.
 *
 * Anyone may set a goal, for themselves, for someone else or for everyone.
 * The reward, if there is one, is written pending in the name of whoever set
 * it; a parent or another adult who is not the one it is for answers it on
 * Today. The policies on planner_goal_rewards are what hold that rule. */
export async function createGoalAction(_prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const me = await requireCurrentMember();

  const title = clamp(String(formData.get("title") ?? ""), 80);
  const kind = String(formData.get("kind") ?? "");
  const owner = String(formData.get("owner") ?? "");
  const target = Number(String(formData.get("target") ?? "").replace(/,/g, ""));
  const unit = clamp(String(formData.get("unit") ?? ""), 24) || null;
  const savingsGoalId = String(formData.get("savings_goal_id") ?? "") || null;
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const reward = clamp(String(formData.get("reward") ?? ""), 120);

  if (!isGoalKind(kind)) return { error: "Choose what kind of goal it is.", field: "kind" };
  const meta = GOAL_KIND_META[kind];
  const period = kind === "weight" ? "total" : String(formData.get("period") ?? meta.defaultPeriod);
  if (!isGoalPeriod(period)) return { error: "Choose how often it counts.", field: "period" };
  if (!title) return { error: "Give the goal a name.", field: "title" };
  if (!(target > 0 && target <= 1_000_000_000)) return { error: "The target has to be a number above zero.", field: "target" };
  if (meta.plus && !readAccess(me.families).plus) return { error: `${meta.label} goals read vitals, which are part of Kin Plus.`, field: "kind" };

  const supabase = await createClient();

  let ownerId: string | null = null;
  if (owner && owner !== "household") {
    const { data: m } = await supabase.from("members").select("id").eq("id", owner).eq("family_id", me.family_id).maybeSingle();
    if (!m) return { error: "That person isn't in your household.", field: "owner" };
    ownerId = m.id;
  }
  if (!ownerId && !meta.household) return { error: `A ${meta.label.toLowerCase()} goal is one person's. Choose whose.`, field: "owner" };

  // Weight measures the way from here to there, so "here" is taken now: the
  // latest reading the owner has. Without one, the first reading after today
  // becomes the start.
  let startValue: number | null = null;
  if (kind === "weight" && ownerId) {
    const { data: w } = await supabase
      .from("health_vitals")
      .select("value_text")
      .eq("family_id", me.family_id)
      .eq("member_id", ownerId)
      .eq("vital_type", "weight")
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const v = w ? parseFloat(w.value_text) : NaN;
    if (v > 0) startValue = v;
  }

  const { data: goal, error } = await supabase
    .from("planner_goals")
    .insert({
      family_id: me.family_id,
      title,
      kind,
      owner_member_id: ownerId,
      target,
      unit: kind === "custom" ? unit : null,
      period,
      start_value: startValue,
      savings_goal_id: kind === "money" ? savingsGoalId : null,
      due_date: dueDate,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !goal) return { error: humanDatabaseError(error?.message ?? "Could not save the goal.") };

  if (reward) {
    const { error: rewardError } = await supabase.from("planner_goal_rewards").insert({
      goal_id: goal.id,
      family_id: me.family_id,
      title: reward,
      proposed_by: me.id,
    });
    // The goal stands either way; say what did not.
    if (rewardError) return { error: `The goal is saved, but not its reward: ${humanDatabaseError(rewardError.message)}` };
  }

  revalidatePath("/planner");
  revalidatePath("/today");
  redirect(`/planner?seg=goals`);
}

/** A session at the gym, a book finished, money put by. Anyone in the house
 * may log against any goal of the house -- the same trust as ticking a
 * shared task -- and each entry is dated today, Manila time. */
export async function logGoalAction(goalId: string, amount = 1): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!(amount > 0 && amount <= 1_000_000_000)) return { error: "That amount doesn't look right." };
  const supabase = await createClient();
  const { data: goal } = await supabase.from("planner_goals").select("id, kind, owner_member_id, savings_goal_id").eq("id", goalId).eq("family_id", me.family_id).maybeSingle();
  if (!goal || !isGoalKind(goal.kind)) return { error: "That goal is no longer here." };
  if (!GOAL_KIND_META[goal.kind].logged || goal.savings_goal_id) return { error: "This goal fills itself." };

  const { error } = await supabase.from("planner_goal_entries").insert({
    family_id: me.family_id,
    goal_id: goal.id,
    member_id: goal.owner_member_id ?? me.id,
    entry_date: familyDay(),
    amount,
  });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/planner");
  return { error: null };
}

/** Undo the last entry of today -- a tap too many. */
export async function unlogGoalAction(goalId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("planner_goal_entries")
    .select("id")
    .eq("goal_id", goalId)
    .eq("family_id", me.family_id)
    .eq("entry_date", familyDay())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { error: "Nothing logged today to take back." };
  const { error } = await supabase.from("planner_goal_entries").delete().eq("id", last.id).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/planner");
  return { error: null };
}

export async function deleteGoalAction(goalId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase.from("planner_goals").delete({ count: "exact" }).eq("id", goalId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "That goal is no longer here." };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** A grown-up's answer on a goal's reward. The role comes from the session
 * and the update is scoped to a reward still pending, like a chore or a
 * redemption; whether this grown-up may answer this one at all (not their
 * own, not one they asked for on a household goal) is the policy's to say,
 * and a refusal there touches no row. */
async function decideGoalReward(goalId: string, status: "approved" | "refused"): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can answer a reward." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("planner_goal_rewards")
    .update({ status, decided_by: me.id, decided_at: new Date().toISOString() }, { count: "exact" })
    .eq("goal_id", goalId)
    .eq("family_id", me.family_id)
    .eq("status", "pending");
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "Someone else answers this one — nobody approves their own reward — or it has already been answered." };

  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

export async function approveGoalRewardAction(goalId: string) {
  return decideGoalReward(goalId, "approved");
}

export async function refuseGoalRewardAction(goalId: string) {
  return decideGoalReward(goalId, "refused");
}
