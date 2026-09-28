"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { readAccess } from "@/lib/access";
import { familyDay } from "@/lib/time";
import { GOAL_KIND_META, isGoalKind, isGoalPeriod } from "@/lib/goals";

export type GoalFormState = { error: string | null; field?: string };

/** Setting a goal, and asking for (or offering) its reward in the same breath.
 *
 * Anyone may set a goal, for themselves, for someone else or for everyone.
 * A reward names who gives it. Asked of someone else, it waits for their
 * yes; offered by the giver themselves, it is promised at once. Anyone may
 * give -- a parent, another adult, a child -- except the goal's owner. The
 * policies on planner_goal_rewards are what hold that rule. */
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
  const giver = String(formData.get("giver") ?? "");

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

  let giverId: string | null = null;
  if (reward) {
    if (!giver) return { error: "Choose who gives the reward.", field: "giver" };
    const { data: g } = await supabase.from("members").select("id").eq("id", giver).eq("family_id", me.family_id).maybeSingle();
    if (!g) return { error: "That person isn't in your household.", field: "giver" };
    if (g.id === ownerId) return { error: "Nobody gives themselves a reward. Choose someone else to give it.", field: "giver" };
    giverId = g.id;
  }

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
    // Offered by the giver: promised now. Asked of someone else: pending.
    const offered = giverId === me.id;
    const { error: rewardError } = await supabase.from("planner_goal_rewards").insert({
      goal_id: goal.id,
      family_id: me.family_id,
      title: reward,
      proposed_by: me.id,
      giver_member_id: giverId,
      ...(offered ? { status: "approved", decided_by: me.id, decided_at: new Date().toISOString() } : {}),
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
  if (error) {
    // The one who promised a reward on it cannot delete the promise with it.
    if (/goal_promised/.test(error.message)) return { error: "You promised a reward on this goal, so it stays until the reward is given — or the one receiving it lets it go." };
    return { error: humanDatabaseError(error.message) };
  }
  if (count === 0) return { error: "That goal is no longer here." };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** Every step of a reward, through goal_reward_act() -- which checks who is
 * acting and from what state, so nothing here is the real rule. Whatever the
 * step, a reward never changes what it is (20260929003000). */
async function rewardStep(goalId: string, action: "promise" | "refuse" | "claim" | "give" | "confirm" | "dispute"): Promise<{ error: string | null }> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("goal_reward_act", { p_goal: goalId, p_action: action });
  if (error) {
    if (/goal_reward_not_yours/.test(error.message)) return { error: "That step isn't yours to take on this reward right now." };
    return { error: humanDatabaseError(error.message) };
  }
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** The giver agrees, accepting the penalty disclosed beside the button. */
export async function approveGoalRewardAction(goalId: string) {
  return rewardStep(goalId, "promise");
}

export async function refuseGoalRewardAction(goalId: string) {
  return rewardStep(goalId, "refuse");
}

/** The receiver: the goal is reached. The giver's day starts now. */
export async function claimGoalRewardAction(goalId: string) {
  return rewardStep(goalId, "claim");
}

/** The giver: it is given. The chase pauses until the receiver confirms. */
export async function markGoalRewardGivenAction(goalId: string) {
  return rewardStep(goalId, "give");
}

/** The receiver: it arrived. The chase stops for good. */
export async function confirmGoalRewardAction(goalId: string) {
  return rewardStep(goalId, "confirm");
}

/** The receiver: it did not arrive. Overdue again at once. */
export async function disputeGoalRewardAction(goalId: string) {
  return rewardStep(goalId, "dispute");
}

/** Take a reward back: the asker or the giver while it waits; once promised,
 * only the one receiving it may let it go. The policy says which the viewer
 * is. */
export async function withdrawGoalRewardAction(goalId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase.from("planner_goal_rewards").delete({ count: "exact" }).eq("goal_id", goalId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "A promised reward can only be let go by the one receiving it." };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** Asking for (or offering) a reward on a goal that has none. */
export async function addGoalRewardAction(goalId: string, title: string, giverId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const reward = clamp(title, 120);
  if (!reward) return { error: "Say what the reward is." };
  const supabase = await createClient();
  const [{ data: goal }, { data: giver }] = await Promise.all([
    supabase.from("planner_goals").select("id, owner_member_id").eq("id", goalId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("members").select("id").eq("id", giverId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!goal) return { error: "That goal is no longer here." };
  if (!giver) return { error: "Choose who gives the reward." };
  if (giver.id === goal.owner_member_id) return { error: "Nobody gives themselves a reward. Choose someone else to give it." };
  const offered = giver.id === me.id;
  const { error } = await supabase.from("planner_goal_rewards").insert({
    goal_id: goal.id,
    family_id: me.family_id,
    title: reward,
    proposed_by: me.id,
    giver_member_id: giver.id,
    ...(offered ? { status: "approved", decided_by: me.id, decided_at: new Date().toISOString() } : {}),
  });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** Editing a goal. The name always changes at once. What it measures --
 * target, period, due date, unit -- changes at once only when no reward is
 * waiting or promised, or when the editor is the one who gives it;
 * otherwise it goes to the giver as a request they can accept or refuse,
 * the way such a thing is negotiated in real life. The trigger on
 * planner_goals holds the same line in the database. */
export async function updateGoalAction(goalId: string, _prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const [{ data: goal }, { data: reward }] = await Promise.all([
    supabase.from("planner_goals").select("*").eq("id", goalId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("planner_goal_rewards").select("giver_member_id, status").eq("goal_id", goalId).maybeSingle(),
  ]);
  if (!goal || !isGoalKind(goal.kind)) return { error: "That goal is no longer here." };

  const title = clamp(String(formData.get("title") ?? ""), 80);
  const target = Number(String(formData.get("target") ?? "").replace(/,/g, ""));
  const period = goal.kind === "weight" ? goal.period : String(formData.get("period") ?? goal.period);
  const unit = goal.kind === "custom" ? clamp(String(formData.get("unit") ?? ""), 24) || null : goal.unit;
  const dueDate = String(formData.get("due_date") ?? "") || null;
  if (!title) return { error: "Give the goal a name.", field: "title" };
  if (!(target > 0 && target <= 1_000_000_000)) return { error: "The target has to be a number above zero.", field: "target" };
  if (!isGoalPeriod(period)) return { error: "Choose how often it counts.", field: "period" };

  const measures = Number(goal.target) !== target || goal.period !== period || goal.due_date !== dueDate || goal.unit !== unit;
  // With a reward in play, a change to what the goal measures needs the other
  // side of the promise -- whichever side asks (20260929003000).
  const needsYes = measures && !!reward && ["pending", "approved", "claimed", "given"].includes(reward.status);

  if (!needsYes) {
    const { error } = await supabase.from("planner_goals").update({ title, target, period, unit, due_date: dueDate }).eq("id", goal.id).eq("family_id", me.family_id);
    if (error) return { error: humanDatabaseError(error.message) };
  } else {
    // The name is nobody's promise: it changes now. The rest waits.
    if (title !== goal.title) {
      const { error } = await supabase.from("planner_goals").update({ title }).eq("id", goal.id).eq("family_id", me.family_id);
      if (error) return { error: humanDatabaseError(error.message) };
    }
    const { error } = await supabase.from("planner_goal_changes").insert({
      family_id: me.family_id,
      goal_id: goal.id,
      proposed_by: me.id,
      target: Number(goal.target) !== target ? target : null,
      period: goal.period !== period ? period : null,
      unit: goal.unit !== unit ? unit : null,
      due_date: dueDate,
      change_due_date: goal.due_date !== dueDate,
    });
    if (error) return { error: humanDatabaseError(error.message) };
  }

  revalidatePath("/planner");
  revalidatePath("/today");
  redirect(`/planner?seg=goals${needsYes ? "&asked=1" : ""}`);
}

/** The giver's answer on a change -- or anyone's, when no reward is in
 * play. decide_goal_change() checks who may, and applies it. */
async function decideGoalChange(changeId: string, approve: boolean): Promise<{ error: string | null }> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_goal_change", { p_change: changeId, p_approve: approve });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

export async function approveGoalChangeAction(changeId: string) {
  return decideGoalChange(changeId, true);
}

export async function refuseGoalChangeAction(changeId: string) {
  return decideGoalChange(changeId, false);
}

export async function withdrawGoalChangeAction(changeId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase.from("planner_goal_changes").delete({ count: "exact" }).eq("id", changeId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "Only whoever asked can take the change back." };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}
