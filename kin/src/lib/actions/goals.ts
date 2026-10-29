"use server";

import { householdZone } from "@/lib/household-zone";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";
import { clamp } from "@/lib/text";
import { readAccess } from "@/lib/access";
import { familyDay } from "@/lib/time";
import { GOAL_KIND_META, LOG_BACK_DAYS, MAX_GOAL_POINTS, READING_BOUNDS, daysBefore, isGoalKind, isLoggableDay, isGoalPeriod, type GoalKind } from "@/lib/goals";
import { stepLiquidIntakeAction } from "@/lib/actions/household";
import { isGrownUp } from "@/lib/roles";
import { weekStartOf } from "@/lib/week";
import { getGoals } from "@/lib/queries/goals";

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
  const wantsPrivate = String(formData.get("visibility") ?? "") === "private";
  const pointsRaw = String(formData.get("points") ?? "").trim();

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
  // "Just me" is the owner's to choose, and a grown-up's (the database holds
  // the same rule, 20261013170000). Anyone else's choice is ignored.
  const visibility = wantsPrivate && ownerId === me.id && isGrownUp(me.role) ? "private" : "household";
  // Points each time it is met: a grown-up's to set, on someone's repeating
  // goal (the database holds the same rule, 20261013171000).
  const points = pointsRaw && isGrownUp(me.role) && ownerId && period !== "total" ? Math.round(Number(pointsRaw)) : 0;
  if (!(points >= 0 && points <= MAX_GOAL_POINTS)) return { error: `Points have to be between 0 and ${MAX_GOAL_POINTS}.`, field: "points" };

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

  // A money goal that makes its savings goal on Wealth (Jonathan, 26
  // October): one entry, two views. The savings goal is the household's
  // for a household ring, else its owner's -- yours, or a child's when a
  // grown-up sets it (goals_child_insert); another grown-up's cannot be
  // made in their name, and the database says so.
  let savingsId: string | null = kind === "money" ? savingsGoalId : null;
  if (kind === "money" && savingsGoalId === "new") {
    const { data: saving, error: savingError } = await supabase
      .from("goals")
      .insert({ family_id: me.family_id, title: clamp(title, 150), is_joint: ownerId === null, owner_member_id: ownerId, target_amount: target, target_date: dueDate, created_by: me.id })
      .select("id")
      .single();
    if (savingError || !saving) return { error: `The savings goal on Wealth could not be made (${databaseError(savingError ?? "unknown")}): a savings goal can be the household's, yours, or a child's.`, field: "savings_goal_id" };
    savingsId = saving.id;
    revalidatePath("/wealth");
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
      savings_goal_id: savingsId,
      due_date: dueDate,
      created_by: me.id,
      // Sent only when hiding, so a household goal still saves in the
      // minutes between this deploying and its migration running.
      ...(visibility === "private" ? { visibility } : {}),
      ...(points > 0 ? { points } : {}),
    })
    .select("id")
    .single();
  if (error || !goal) return { error: databaseError(error ?? "Could not save the goal.") };

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
    if (rewardError) return { error: `The goal is saved, but not its reward: ${databaseError(rewardError)}` };
  }

  revalidatePath("/planner");
  revalidatePath("/today");
  redirect(`/planner?seg=goals`);
}

/** A session at the gym, a book finished, money put by. Anyone in the house
 * may log against any goal of the house -- the same trust as ticking a
 * shared task. Dated today (household time) unless a day in the past week
 * is named: the session written down a day late. */
export async function logGoalAction(goalId: string, amount = 1, day?: string): Promise<{ error: string | null }> {
  const tz = await householdZone();
  const me = await requireCurrentMember();
  if (!(amount > 0 && amount <= 1_000_000_000)) return { error: "That amount doesn't look right." };
  const today = familyDay(new Date(), tz);
  const entryDate = day ?? today;
  if (!isLoggableDay(entryDate, today)) return { error: "Choose today or a day in the past week." };
  const supabase = await createClient();
  const { data: goal } = await supabase.from("planner_goals").select("id, kind, owner_member_id, savings_goal_id").eq("id", goalId).eq("family_id", me.family_id).maybeSingle();
  if (!goal || !isGoalKind(goal.kind)) return { error: "That goal is no longer here." };
  if (!GOAL_KIND_META[goal.kind].logged || goal.savings_goal_id) return { error: "This goal fills itself." };

  const { error } = await supabase.from("planner_goal_entries").insert({
    family_id: me.family_id,
    goal_id: goal.id,
    member_id: goal.owner_member_id ?? me.id,
    entry_date: entryDate,
    amount,
  });
  if (error) return { error: databaseError(error) };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** Undo the latest entry of the past week -- a tap too many, or the wrong
 * day. */
export async function unlogGoalAction(goalId: string): Promise<{ error: string | null }> {
  const tz = await householdZone();
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const today = familyDay(new Date(), tz);
  const { data: last } = await supabase
    .from("planner_goal_entries")
    .select("id")
    .eq("goal_id", goalId)
    .eq("family_id", me.family_id)
    .gte("entry_date", daysBefore(today, LOG_BACK_DAYS))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { error: "Nothing logged this week to take back." };
  const { error } = await supabase.from("planner_goal_entries").delete().eq("id", last.id).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** Whose number a hand entry is: the goal's owner, or on a household goal
 * whoever is logging. Also checks the goal is this household's and of the
 * kind asked for. */
async function goalForReading(goalId: string, kinds: GoalKind[]) {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: goal } = await supabase.from("planner_goals").select("*").eq("id", goalId).eq("family_id", me.family_id).maybeSingle();
  if (!goal || !isGoalKind(goal.kind) || !kinds.includes(goal.kind)) return { error: "That goal is no longer here." as string, me, supabase, goal: null, memberId: null };
  return { error: null, me, supabase, goal: { ...goal, kind: goal.kind as GoalKind }, memberId: goal.owner_member_id ?? me.id };
}

/** A glass more or less on a water goal. It is the same count as the water
 * on Today -- one number per person per day -- so a glass is never counted
 * twice, wherever it was tapped. */
export async function stepGoalWaterAction(goalId: string, delta: 1 | -1, day?: string): Promise<{ error: string | null }> {
  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  const date = day ?? today;
  if (!isLoggableDay(date, today)) return { error: "Choose today or a day in the past week." };
  const found = await goalForReading(goalId, ["water"]);
  if (found.error || !found.memberId) return { error: found.error };
  return stepLiquidIntakeAction({ memberId: found.memberId, type: "water", date, delta });
}

/** A steps or weight reading typed by hand, saved in Health where Apple
 * Health's readings already live (source 'manual'). Steps are the day's
 * total: a second entry for the same day replaces the first, and the goal
 * counts the larger of it and Apple Health's figure, never both. Weight is
 * a reading: the latest one counts, whoever sent it. */
export async function logGoalReadingAction(goalId: string, value: number, day?: string): Promise<{ error: string | null }> {
  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  const date = day ?? today;
  if (!isLoggableDay(date, today)) return { error: "Choose today or a day in the past week." };
  const found = await goalForReading(goalId, ["steps", "weight"]);
  if (found.error || !found.goal || !found.memberId) return { error: found.error };
  const { me, supabase, goal, memberId } = found;
  if (!readAccess(me.families).plus) return { error: "Steps and weight readings are part of Kin Plus." };
  const kind = goal.kind as "steps" | "weight";
  const bounds = READING_BOUNDS[kind];
  if (!(Number.isFinite(value) && value > bounds.min && value <= bounds.max)) {
    return { error: kind === "steps" ? "That many steps doesn't look right." : "That weight doesn't look right." };
  }
  const valueText = kind === "steps" ? String(Math.round(value)) : String(Math.round(value * 10) / 10);

  if (kind === "steps") {
    const { data: existing } = await supabase
      .from("health_vitals")
      .select("id")
      .eq("family_id", me.family_id)
      .eq("member_id", memberId)
      .eq("vital_type", "steps")
      .eq("source", "manual")
      .eq("reading_date", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("health_vitals").update({ value_text: valueText }).eq("id", existing.id).eq("family_id", me.family_id);
      if (error) return { error: databaseError(error) };
      return readingSaved(memberId);
    }
  }

  const { error } = await supabase.from("health_vitals").insert({
    family_id: me.family_id,
    member_id: memberId,
    vital_type: kind,
    reading_date: date,
    value_text: valueText,
    unit: kind === "steps" ? "steps" : "kg",
    source: "manual",
    // A reading follows its goal: "Just me" there is "Just me" in Health.
    visibility: goal.visibility === "private" ? "private" : "family",
    created_by: me.id,
  });
  if (error) return { error: databaseError(error) };
  return readingSaved(memberId);
}

function readingSaved(memberId: string): { error: null } {
  revalidatePath("/planner");
  revalidatePath("/today");
  revalidatePath(`/family/members/${memberId}`);
  return { error: null };
}

/** Take back the latest reading this person typed for the goal in the past
 * week. Never touches what Apple Health sent. */
export async function unlogGoalReadingAction(goalId: string): Promise<{ error: string | null }> {
  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  const found = await goalForReading(goalId, ["steps", "weight"]);
  if (found.error || !found.goal || !found.memberId) return { error: found.error };
  const { me, supabase, goal, memberId } = found;
  const { data: last } = await supabase
    .from("health_vitals")
    .select("id")
    .eq("family_id", me.family_id)
    .eq("member_id", memberId)
    .eq("vital_type", goal.kind)
    .eq("source", "manual")
    .eq("created_by", me.id)
    .gte("reading_date", daysBefore(today, LOG_BACK_DAYS))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { error: "Nothing typed in this week to take back." };
  const { error } = await supabase.from("health_vitals").delete().eq("id", last.id).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  return readingSaved(memberId);
}

/** Who sees a goal: the whole household, or just its owner (and whoever
 * gives its reward). Only the owner switches it, only a grown-up hides one,
 * and it does not change what the goal measures, so it needs no one's yes.
 * The database refuses anyone else (planner_goals_visibility_guard). */
export async function setGoalVisibilityAction(goalId: string, visibility: "household" | "private"): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (visibility !== "household" && visibility !== "private") return { error: "Choose who sees it." };
  const supabase = await createClient();
  const { data: goal } = await supabase.from("planner_goals").select("id, owner_member_id").eq("id", goalId).eq("family_id", me.family_id).maybeSingle();
  if (!goal) return { error: "That goal is no longer here." };
  if (goal.owner_member_id !== me.id) return { error: "Only the person whose goal it is can choose who sees it." };
  if (visibility === "private" && !isGrownUp(me.role)) return { error: "A child's goals stay visible to the grown-ups of the house." };
  const { error } = await supabase.from("planner_goals").update({ visibility }).eq("id", goalId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

export async function deleteGoalAction(goalId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase.from("planner_goals").delete({ count: "exact" }).eq("id", goalId).eq("family_id", me.family_id);
  if (error) {
    // The one who promised a reward on it cannot delete the promise with it.
    if (/goal_promised/.test(error.message)) return { error: "You promised a reward on this goal, so it stays until the reward is given — or the one receiving it lets it go." };
    return { error: databaseError(error) };
  }
  if (count === 0) return { error: "That goal is no longer here." };
  revalidatePath("/planner");
  revalidatePath("/today");
  // A 🎯 goal's mark on Wealth goes with it.
  revalidatePath("/wealth");
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
    return { error: databaseError(error) };
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
  if (error) return { error: databaseError(error) };
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
  if (error) return { error: databaseError(error) };
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
  // What meeting it is worth: a grown-up's, and it applies at once -- it is
  // not what the goal measures, and what was earned keeps its own worth.
  const pointsRaw = formData.get("points");
  const grownUp = isGrownUp(me.role);
  let points = Number(goal.points ?? 0);
  if (grownUp && pointsRaw !== null) points = String(pointsRaw).trim() === "" ? 0 : Math.round(Number(pointsRaw));
  if (period === "total" || !goal.owner_member_id) points = 0;
  if (!(points >= 0 && points <= MAX_GOAL_POINTS)) return { error: `Points have to be between 0 and ${MAX_GOAL_POINTS}.`, field: "points" };
  if (points !== Number(goal.points ?? 0) && !grownUp) return { error: "This goal earns points each time; a grown-up can change how often it counts.", field: "period" };
  const pointsChange = points !== Number(goal.points ?? 0) ? { points } : {};

  const measures = Number(goal.target) !== target || goal.period !== period || goal.due_date !== dueDate || goal.unit !== unit;
  // With a reward in play, a change to what the goal measures needs the other
  // side of the promise -- whichever side asks (20260929003000).
  const needsYes = measures && !!reward && ["pending", "approved", "claimed", "given"].includes(reward.status);

  if (!needsYes) {
    const { error } = await supabase.from("planner_goals").update({ title, target, period, unit, due_date: dueDate, ...pointsChange }).eq("id", goal.id).eq("family_id", me.family_id);
    if (error) return { error: databaseError(error) };
    if (measures) await carryRingToSavings(supabase, me.family_id, goal.id);
  } else {
    // The name is nobody's promise: it changes now. The rest waits.
    if (title !== goal.title || "points" in pointsChange) {
      const { error } = await supabase.from("planner_goals").update({ title, ...pointsChange }).eq("id", goal.id).eq("family_id", me.family_id);
      if (error) return { error: databaseError(error) };
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
    if (error) return { error: databaseError(error) };
  }

  revalidatePath("/planner");
  revalidatePath("/today");
  redirect(`/planner?seg=goals${needsYes ? "&asked=1" : ""}`);
}

/** A money ring's target and date, carried to the savings goal on Wealth it
 * fills from (Jonathan, 26 October), so the two never disagree. Best
 * effort: whoever cannot change the savings goal (a child, on a grown-up's
 * goal) leaves it as it was, and Wealth still shows its own. */
async function carryRingToSavings(supabase: Awaited<ReturnType<typeof createClient>>, familyId: string, ringId: string) {
  const { data: ring } = await supabase.from("planner_goals").select("kind, target, due_date, savings_goal_id").eq("id", ringId).eq("family_id", familyId).maybeSingle();
  if (!ring || ring.kind !== "money" || !ring.savings_goal_id) return;
  const { data: saving } = await supabase.from("goals").select("repeats_yearly, target_date").eq("id", ring.savings_goal_id).eq("family_id", familyId).maybeSingle();
  if (!saving) return;
  // A yearly fund keeps its date: the ring may have none.
  const date = saving.repeats_yearly && !ring.due_date ? saving.target_date : ring.due_date;
  await supabase.from("goals").update({ target_amount: Number(ring.target), target_date: date }).eq("id", ring.savings_goal_id).eq("family_id", familyId);
  revalidatePath("/wealth");
}

/** The giver's answer on a change -- or anyone's, when no reward is in
 * play. decide_goal_change() checks who may, and applies it. */
async function decideGoalChange(changeId: string, approve: boolean): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: change } = approve ? await supabase.from("planner_goal_changes").select("goal_id").eq("id", changeId).eq("family_id", me.family_id).maybeSingle() : { data: null };
  const { error } = await supabase.rpc("decide_goal_change", { p_change: changeId, p_approve: approve });
  if (error) return { error: databaseError(error) };
  if (change?.goal_id) await carryRingToSavings(supabase, me.family_id, change.goal_id);
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
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "Only whoever asked can take the change back." };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** "I did it" on a repeating goal: this period is met. Only offered, and
 * only accepted here, once the ring is full -- read the same way the card
 * reads it. A grown-up's claim counts at once; a child's waits for a
 * grown-up's yes on Today. What it is worth is set by the database from
 * the goal (20261013171000). */
export async function claimGoalPeriodAction(goalId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const goal = (await getGoals(me.family_id, me, weekStartOf(me.families.week_start))).find((g) => g.id === goalId);
  if (!goal) return { error: "That goal is no longer here." };
  if (goal.period === "total") return { error: "A one-off goal has its reward instead." };
  if (goal.ownerId !== me.id) return { error: "Only the person whose goal it is can say it's done." };
  if (!goal.reached) return { error: "Not there yet — the ring isn't full." };
  if (goal.claim) return { error: "Already claimed for this one." };
  const supabase = await createClient();
  const { error } = await supabase.from("planner_goal_completions").insert({ family_id: me.family_id, goal_id: goal.id, member_id: me.id, period_start: goal.periodStart });
  if (error) return { error: databaseError(error) };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** Take back this period's claim -- a tap too early. A refused one stays. */
export async function unclaimGoalPeriodAction(goalId: string, periodStart: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("planner_goal_completions")
    .delete({ count: "exact" })
    .eq("goal_id", goalId)
    .eq("period_start", periodStart)
    .eq("member_id", me.id)
    .neq("status", "refused");
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "Nothing to take back." };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}

/** A grown-up's answer on a child's claim, from Today's queue. The policy
 * holds who may: a grown-up, never on their own, once. */
export async function answerGoalClaimAction(claimId: string, yes: boolean): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up answers these." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("planner_goal_completions")
    .update({ status: yes ? "counted" : "refused", decided_by: me.id, decided_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", claimId)
    .eq("family_id", me.family_id)
    .eq("status", "pending");
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "Already answered, or taken back." };
  revalidatePath("/planner");
  revalidatePath("/today");
  return { error: null };
}
