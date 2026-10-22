"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { householdZone } from "@/lib/household-zone";
import { databaseError } from "@/lib/report-error";
import { clamp } from "@/lib/text";
import { familyDay } from "@/lib/time";
import { windowStart } from "@/lib/goals";
import { isGrownUp } from "@/lib/roles";
import { weekStartOf } from "@/lib/week";
import type { TablesInsert } from "@/lib/database.types";
import { readAccess } from "@/lib/access";
import { DEFAULT_GOAL_COINS, DEFAULT_GOAL_XP, MAX_GOAL_XP, isGameCategory, stepParts } from "@/lib/game";

/** Planner → Goals → Game. The database holds every rule that matters
 * (20261020120000): who may tap for whom, only today, only a grown-up sets
 * up a game goal, what a claim is worth. These check the same things first
 * only to say so plainly. */

function done() {
  revalidatePath("/planner");
  revalidatePath("/today");
}

async function gameGoal(goalId: string) {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: goal } = await supabase
    .from("planner_goals")
    .select("id, kind, owner_member_id, period, target, category, active")
    .eq("id", goalId)
    .eq("family_id", me.family_id)
    .not("category", "is", null)
    .maybeSingle();
  const today = familyDay(new Date(), await householdZone());
  const start = goal && (goal.period === "day" || goal.period === "week") ? windowStart(goal.period, today, weekStartOf(me.families.week_start), today) : today;
  return { me, supabase, goal, today, start };
}

async function periodTotal(supabase: Awaited<ReturnType<typeof createClient>>, goalId: string, start: string, today: string): Promise<number> {
  const { data } = await supabase.from("planner_goal_entries").select("amount").eq("goal_id", goalId).gte("entry_date", start).lte("entry_date", today);
  return (data ?? []).reduce((a, e) => a + Number(e.amount), 0);
}

/** "+": one more, today. When that fills the goal, it is claimed for its
 * owner -- a grown-up's claim (their own, or for a child with no login)
 * counts at once; a child's own waits for a grown-up's yes. */
export async function gameTapAction(goalId: string, steps?: number): Promise<{ error: string | null }> {
  const { me, goal } = await gameGoal(goalId);
  if (!goal) return { error: "That goal is no longer here." };
  if (!goal.active) return { error: "This goal is paused." };
  if (goal.kind === "steps") return { error: "Steps are typed in, not tapped." };
  if (steps && !readAccess(me.families).plus) return { error: "Steps are part of Kin Plus." };
  // One log, counted wherever it belongs (20261020190000 game_log): this
  // goal, the goals linked to it that the caller may log, the claims any of
  // them now reach -- and the walk's steps, if given, added to the caller's.
  const supabase = await createClient();
  const { error } = await supabase.rpc("game_log", { p_goal: goal.id, p_steps: steps && steps > 0 ? Math.round(steps) : undefined });
  if (error) return { error: databaseError(error) };
  done();
  return { error: null };
}

/** "−": take back today's latest tap. If that leaves the goal short, its
 * claim goes too (a refused one stays: the no is not undone this way). */
export async function gameUntapAction(goalId: string): Promise<{ error: string | null }> {
  const { me, supabase, goal, today, start } = await gameGoal(goalId);
  if (!goal) return { error: "That goal is no longer here." };
  const { data: last } = await supabase
    .from("planner_goal_entries")
    .select("id")
    .eq("goal_id", goal.id)
    .eq("family_id", me.family_id)
    .eq("entry_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { error: "Nothing logged today to take back." };
  const { error } = await supabase.from("planner_goal_entries").delete().eq("id", last.id);
  if (error) return { error: databaseError(error) };
  if (goal.owner_member_id && (await periodTotal(supabase, goal.id, start, today)) < Number(goal.target)) {
    await supabase.from("planner_goal_completions").delete().eq("goal_id", goal.id).eq("period_start", start).neq("status", "refused");
  }
  done();
  return { error: null };
}

/** Which goal a new target helps (20261021030000), for each person it is
 * made for: the goal's own person, or anyone when it is the whole
 * household's. Read through the caller's own access; the database checks the
 * same rule again (planner_goals_helps_check). */
async function helpsFor(supabase: Awaited<ReturnType<typeof createClient>>, familyId: string, formData: FormData): Promise<(owner: string | null) => string | null> {
  const id = String(formData.get("helps") ?? "");
  if (!id) return () => null;
  const { data: goal } = await supabase.from("planner_goals").select("id, owner_member_id").eq("id", id).eq("family_id", familyId).is("category", null).maybeSingle();
  if (!goal) return () => null;
  return (owner) => (goal.owner_member_id === null || goal.owner_member_id === owner ? goal.id : null);
}

/** Every target comes from a goal (Janine, 21 October): a new one is
 * refused unless each copy of it helps a goal its person may have. */
const NEEDS_A_GOAL = "Choose the goal this target helps. A goal for one person takes targets for that person alone; a whole-family goal takes anyone's.";

export type GameGoalFormState = { error: string | null; saved?: number };

/** A grown-up sets up a game goal for one or more people: one goal each,
 * so a child and a grown-up can have different targets later. "Whole
 * family" makes one shared goal everyone adds to (no XP: nobody to give
 * it to). */
export async function createGameGoalAction(_prev: GameGoalFormState, formData: FormData): Promise<GameGoalFormState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Targets are a grown-up's to set up." };
  const title = clamp(String(formData.get("title") ?? "").trim(), 80);
  const category = String(formData.get("category") ?? "");
  const period = String(formData.get("period") ?? "day");
  const target = Number(formData.get("target"));
  const unit = clamp(String(formData.get("unit") ?? "").trim(), 24) || null;
  const xp = Math.round(Number(formData.get("xp") ?? DEFAULT_GOAL_XP));
  const points = Math.round(Number(formData.get("points") ?? DEFAULT_GOAL_COINS));
  const who = formData.getAll("who").map(String);
  if (!title) return { error: "Give the goal a name." };
  if (!isGameCategory(category)) return { error: "Choose a category." };
  if (period !== "day" && period !== "week") return { error: "Daily or weekly." };
  if (!(Number.isInteger(target) && target >= 1 && target <= 1000)) return { error: "The target is a whole number from 1 to 1,000." };
  if (!(xp >= 0 && xp <= MAX_GOAL_XP) || !(points >= 0 && points <= 1000)) return { error: "XP and coins are from 0 to 1,000." };
  if (who.length === 0) return { error: "Choose who it is for." };

  const supabase = await createClient();
  const helps = await helpsFor(supabase, me.family_id, formData);
  const base = { family_id: me.family_id, title, kind: "custom", category, period, target, unit, created_by: me.id };
  const rows: TablesInsert<"planner_goals">[] = who.includes("family")
    ? [{ ...base, owner_member_id: null, xp: 0, points: 0, helps_goal_id: helps(null) }]
    : who.map((id) => ({ ...base, owner_member_id: id, xp, points, helps_goal_id: helps(id) }));
  if (rows.some((r) => !r.helps_goal_id)) return { error: NEEDS_A_GOAL };
  const { error } = await supabase.from("planner_goals").insert(rows);
  if (error) return { error: databaseError(error) };
  done();
  return { error: null, saved: rows.length };
}

export async function setGameGoalActiveAction(goalId: string, active: boolean): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up pauses goals." };
  const supabase = await createClient();
  const { error } = await supabase.from("planner_goals").update({ active }).eq("id", goalId).eq("family_id", me.family_id).not("category", "is", null);
  if (error) return { error: databaseError(error) };
  done();
  return { error: null };
}

/** Today's steps on a steps game goal (20261020150000): "set" replaces the
 * day's typed number, "add" adds to it (the +500 and +1,000). Saved where
 * steps always live -- a 'manual' reading in health_vitals, beside whatever
 * Apple Health sends -- then the halves the day has reached are claimed and
 * any it no longer reaches are taken back. The nightly job settles the same
 * way, so steps from a sync earn too. Kin Plus, as steps goals are. */
export async function gameStepsAction(goalId: string, value: number, mode: "set" | "add"): Promise<{ error: string | null }> {
  const { me, supabase, goal, today } = await gameGoal(goalId);
  if (!goal || goal.kind !== "steps" || !goal.owner_member_id) return { error: "That goal is no longer here." };
  if (!goal.active) return { error: "This goal is paused." };
  if (!readAccess(me.families).plus) return { error: "Steps are part of Kin Plus." };
  const owner = goal.owner_member_id;
  if (owner !== me.id) {
    const { data: child } = await supabase.from("members").select("role").eq("id", owner).eq("family_id", me.family_id).maybeSingle();
    if (!(isGrownUp(me.role) && child?.role === "child_managed")) return { error: "Only the person whose goal it is types their steps (a grown-up may for a child without a login)." };
  }
  if (!(Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= 200_000)) return { error: "That many steps doesn't look right." };

  const { data: existing } = await supabase
    .from("health_vitals")
    .select("id, value_text")
    .eq("family_id", me.family_id)
    .eq("member_id", owner)
    .eq("vital_type", "steps")
    .eq("source", "manual")
    .eq("created_by", me.id)
    .eq("reading_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = Math.min(200_000, mode === "add" ? (Number(existing?.value_text) || 0) + value : value);
  const { error } = existing
    ? await supabase.from("health_vitals").update({ value_text: String(next) }).eq("id", existing.id).eq("family_id", me.family_id)
    : await supabase.from("health_vitals").insert({ family_id: me.family_id, member_id: owner, vital_type: "steps", reading_date: today, value_text: String(next), unit: "steps", source: "manual", visibility: "family", created_by: me.id });
  if (error) return { error: databaseError(error) };

  // The day as the game counts it: the larger of typed and synced.
  const { data: days } = await supabase.rpc("game_steps_days", { p_from: today, p_to: today });
  const steps = Number((days ?? []).find((d) => d.member_id === owner)?.steps ?? next);
  const reached = new Set(stepParts(steps, Number(goal.target)));
  const { data: claimed } = await supabase.from("planner_goal_completions").select("part, status").eq("goal_id", goal.id).eq("period_start", today);
  const have = new Set((claimed ?? []).map((c) => c.part));
  for (const part of ["half", "rest"] as const) {
    if (reached.has(part) && !have.has(part)) {
      const { error: claimError } = await supabase.from("planner_goal_completions").insert({ family_id: me.family_id, goal_id: goal.id, member_id: owner, period_start: today, part });
      if (claimError) return { error: databaseError(claimError) };
    }
    if (!reached.has(part) && have.has(part)) {
      await supabase.from("planner_goal_completions").delete().eq("goal_id", goal.id).eq("period_start", today).eq("part", part).neq("status", "refused");
    }
  }
  done();
  return { error: null };
}

/** A grown-up sets up steps: one daily goal per person, each with its own
 * target (target_<member id>), or the household's weekly total. Kin Plus. */
export async function createStepsGoalAction(_prev: GameGoalFormState, formData: FormData): Promise<GameGoalFormState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Targets are a grown-up's to set up." };
  if (!readAccess(me.families).plus) return { error: "Steps are part of Kin Plus." };
  const title = clamp(String(formData.get("title") ?? "").trim(), 80) || "Steps";
  const xp = Math.round(Number(formData.get("xp") ?? DEFAULT_GOAL_XP));
  const points = Math.round(Number(formData.get("points") ?? DEFAULT_GOAL_COINS));
  const who = formData.getAll("who").map(String);
  if (!(xp >= 0 && xp <= MAX_GOAL_XP) || !(points >= 0 && points <= 1000)) return { error: "XP and coins are from 0 to 1,000." };
  if (who.length === 0) return { error: "Choose who it is for." };
  const sane = (n: number, max: number) => Number.isInteger(n) && n >= 100 && n <= max;

  const supabase = await createClient();
  const helps = await helpsFor(supabase, me.family_id, formData);
  const base = { family_id: me.family_id, title, kind: "steps", unit: "steps", created_by: me.id };
  let rows: TablesInsert<"planner_goals">[];
  if (who.includes("family")) {
    const target = Number(formData.get("family_target"));
    if (!sane(target, 5_000_000)) return { error: "The family's weekly target is from 100 to 5,000,000 steps." };
    rows = [{ ...base, category: "family", period: "week", target, owner_member_id: null, xp: 0, points: 0, helps_goal_id: helps(null) }];
  } else {
    rows = [];
    for (const id of who) {
      const target = Number(formData.get(`target_${id}`));
      if (!sane(target, 100_000)) return { error: "Each daily target is from 100 to 100,000 steps." };
      rows.push({ ...base, category: "move", period: "day", target, owner_member_id: id, xp, points, helps_goal_id: helps(id) });
    }
  }
  if (rows.some((r) => !r.helps_goal_id)) return { error: NEEDS_A_GOAL };
  const { error } = await supabase.from("planner_goals").insert(rows);
  if (error) return { error: databaseError(error) };
  done();
  return { error: null, saved: rows.length };
}

/** Editing a game goal. Its name, worth, days, category and picture change
 * in place. What it measures (the target) does not -- a claim already made
 * was for the old one -- so a new target makes a new goal, carrying the
 * links over, and removes the old (its earnings stay). */
export async function updateGameGoalAction(goalId: string, formData: FormData): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Targets are a grown-up's to change." };
  const supabase = await createClient();
  const { data: goal } = await supabase.from("planner_goals").select("*").eq("id", goalId).eq("family_id", me.family_id).not("category", "is", null).is("removed_at", null).maybeSingle();
  if (!goal) return { error: "That goal is no longer here." };

  const title = clamp(String(formData.get("title") ?? "").trim(), 80);
  const category = String(formData.get("category") ?? goal.category);
  const xp = Math.round(Number(formData.get("xp") ?? goal.xp));
  const points = Math.round(Number(formData.get("points") ?? goal.points));
  const target = Number(formData.get("target") ?? goal.target);
  const emoji = clamp(String(formData.get("emoji") ?? "").trim(), 16) || null;
  const dayList = formData.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const days = goal.period === "day" && dayList.length > 0 && dayList.length < 7 ? dayList : null;
  if (!title) return { error: "Give the goal a name." };
  if (!isGameCategory(category)) return { error: "Choose a category." };
  if (!(target > 0 && target <= (goal.kind === "steps" ? 5_000_000 : 1000))) return { error: "That target doesn't look right." };
  if (!(xp >= 0 && xp <= MAX_GOAL_XP) || !(points >= 0 && points <= 1000)) return { error: "XP and coins are from 0 to 1,000." };
  const owned = goal.owner_member_id !== null;
  // "Helps with" (20261021030000): only when the form has the picker; the
  // database refuses a goal of someone else's.
  const helps_goal_id = formData.has("helps") ? String(formData.get("helps") ?? "") || null : goal.helps_goal_id;
  const changes = { title, category, xp: owned ? xp : 0, points: owned ? points : 0, emoji, days, helps_goal_id };

  if (target === Number(goal.target)) {
    const { error } = await supabase.from("planner_goals").update(changes).eq("id", goal.id).eq("family_id", me.family_id);
    if (error) return { error: databaseError(error) };
  } else {
    const { id: _old, created_at: _at, ...rest } = goal;
    void _old;
    void _at;
    const { data: made, error } = await supabase.from("planner_goals").insert({ ...rest, ...changes, target, created_by: me.id }).select("id").single();
    if (error) return { error: databaseError(error) };
    const { data: links } = await supabase.from("planner_goal_links").select("goal_id, linked_goal_id").or(`goal_id.eq.${goal.id},linked_goal_id.eq.${goal.id}`);
    for (const l of links ?? []) {
      await supabase.from("planner_goal_links").insert({
        goal_id: l.goal_id === goal.id ? made.id : l.goal_id,
        linked_goal_id: l.linked_goal_id === goal.id ? made.id : l.linked_goal_id,
        family_id: me.family_id,
        created_by: me.id,
      });
    }
    const { error: removeError } = await supabase.from("planner_goals").update({ active: false, removed_at: new Date().toISOString() }).eq("id", goal.id).eq("family_id", me.family_id);
    if (removeError) return { error: databaseError(removeError) };
  }
  done();
  return { error: null };
}

/** Removed, not deleted (20261020210000): it leaves every list, and what it
 * earned stays earned. */
export async function removeGameGoalAction(goalId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Targets are a grown-up's to remove." };
  const supabase = await createClient();
  const { error } = await supabase.from("planner_goals").update({ active: false, removed_at: new Date().toISOString() }).eq("id", goalId).eq("family_id", me.family_id).not("category", "is", null);
  if (error) return { error: databaseError(error) };
  done();
  return { error: null };
}

/** The starter rewards the sample game and the family pack used to add, by
 * name: what "Start fresh from my goals" takes off the Shop. */
const STARTER_REWARDS = [
  "Pick the family movie",
  "Extra 30 minutes of screen time",
  "Ice cream treat",
  "Choose Sunday lunch",
  "Choose the bedtime story",
  "An extra park trip",
  "Pick the weekend snack",
  "A new sticker sheet",
  "Solo coffee break",
  "Sleep in on a weekend",
  "Choose the family movie",
  "Date night",
  "Special breakfast out (all family goals this week)",
].map((t) => t.toLowerCase());

/** Start fresh from my goals (Janine, 21 October): every target that helps
 * no goal -- the starter pack's and the sample game's -- is removed the way
 * Remove removes one (it leaves every list; what it earned stays earned),
 * and, if asked, the starter rewards come off the Shop. Pressed by a
 * grown-up, in their own household only. */
export async function startFreshFromGoalsAction(withRewards: boolean): Promise<{ error: string | null; targets?: number; rewards?: number }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up clears the targets." };
  const supabase = await createClient();
  const { data: gone, error } = await supabase
    .from("planner_goals")
    .update({ active: false, removed_at: new Date().toISOString() })
    .eq("family_id", me.family_id)
    .not("category", "is", null)
    .is("helps_goal_id", null)
    .is("removed_at", null)
    .select("id");
  if (error) return { error: databaseError(error) };
  let rewards = 0;
  if (withRewards) {
    const { data: shelf } = await supabase.from("rewards").select("id, title").eq("family_id", me.family_id).eq("active", true);
    const ids = (shelf ?? []).filter((r) => STARTER_REWARDS.includes(r.title.toLowerCase())).map((r) => r.id);
    if (ids.length > 0) {
      const { data: retired, error: rewardError } = await supabase.from("rewards").update({ active: false }).eq("family_id", me.family_id).in("id", ids).select("id");
      if (rewardError) return { error: databaseError(rewardError) };
      rewards = retired?.length ?? 0;
    }
  }
  done();
  return { error: null, targets: gone?.length ?? 0, rewards };
}

/** The family-week treat, enjoyed: marked by a grown-up, once a week
 * (game_use_family_treat checks the role and the week again). */
export async function markFamilyTreatAction(week: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up marks the family treat." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("game_use_family_treat", { p_week: week });
  if (error) return { error: databaseError(error) };
  done();
  return { error: null };
}
