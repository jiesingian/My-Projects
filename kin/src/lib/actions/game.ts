"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { householdZone } from "@/lib/household-zone";
import { humanDatabaseError } from "@/lib/db-errors";
import { clamp } from "@/lib/text";
import { familyDay } from "@/lib/time";
import { windowStart } from "@/lib/goals";
import { isGrownUp } from "@/lib/roles";
import { weekStartOf } from "@/lib/week";
import type { TablesInsert } from "@/lib/database.types";
import { readAccess } from "@/lib/access";
import { DEFAULT_GOAL_COINS, DEFAULT_GOAL_XP, MAX_GOAL_XP, isGameCategory, stepParts, type GameCategory } from "@/lib/game";

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
export async function gameTapAction(goalId: string): Promise<{ error: string | null }> {
  const { me, supabase, goal, today, start } = await gameGoal(goalId);
  if (!goal) return { error: "That goal is no longer here." };
  if (!goal.active) return { error: "This goal is paused." };
  if (goal.kind === "steps") return { error: "Steps are typed in, not tapped." };
  const { error } = await supabase.from("planner_goal_entries").insert({ family_id: me.family_id, goal_id: goal.id, member_id: me.id, entry_date: today, amount: 1 });
  if (error) return { error: humanDatabaseError(error.message) };

  if (goal.owner_member_id && (await periodTotal(supabase, goal.id, start, today)) >= Number(goal.target)) {
    const { data: claimed } = await supabase.from("planner_goal_completions").select("id").eq("goal_id", goal.id).eq("period_start", start).maybeSingle();
    if (!claimed) {
      const { error: claimError } = await supabase
        .from("planner_goal_completions")
        .insert({ family_id: me.family_id, goal_id: goal.id, member_id: goal.owner_member_id, period_start: start });
      if (claimError) return { error: humanDatabaseError(claimError.message) };
    }
  }
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
  if (error) return { error: humanDatabaseError(error.message) };
  if (goal.owner_member_id && (await periodTotal(supabase, goal.id, start, today)) < Number(goal.target)) {
    await supabase.from("planner_goal_completions").delete().eq("goal_id", goal.id).eq("period_start", start).neq("status", "refused");
  }
  done();
  return { error: null };
}

export type GameGoalFormState = { error: string | null; saved?: number };

/** A grown-up sets up a game goal for one or more people: one goal each,
 * so a child and a grown-up can have different targets later. "Whole
 * family" makes one shared goal everyone adds to (no XP: nobody to give
 * it to). */
export async function createGameGoalAction(_prev: GameGoalFormState, formData: FormData): Promise<GameGoalFormState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Game goals are a grown-up's to set up." };
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
  const base = { family_id: me.family_id, title, kind: "custom", category, period, target, unit, created_by: me.id };
  const rows: TablesInsert<"planner_goals">[] = who.includes("family")
    ? [{ ...base, owner_member_id: null, xp: 0, points: 0 }]
    : who.map((id) => ({ ...base, owner_member_id: id, xp, points }));
  const { error } = await supabase.from("planner_goals").insert(rows);
  if (error) return { error: humanDatabaseError(error.message) };
  done();
  return { error: null, saved: rows.length };
}

export async function setGameGoalActiveAction(goalId: string, active: boolean): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up pauses goals." };
  const supabase = await createClient();
  const { error } = await supabase.from("planner_goals").update({ active }).eq("id", goalId).eq("family_id", me.family_id).not("category", "is", null);
  if (error) return { error: humanDatabaseError(error.message) };
  done();
  return { error: null };
}

/** Starter content, in the caller's own household only (RLS keeps it there):
 * a few habit goals for each person and a few rewards. Run once -- it adds
 * nothing if the household already has game goals. Habits only: no weight,
 * calorie or body-size goals. */
const SAMPLE_GOALS: { title: string; category: GameCategory; target: number; unit: string; forKids: boolean; forGrownUps: boolean }[] = [
  { title: "Drink water", category: "water", target: 6, unit: "glasses", forKids: true, forGrownUps: false },
  { title: "Drink water", category: "water", target: 8, unit: "glasses", forKids: false, forGrownUps: true },
  { title: "Brush teeth", category: "hygiene", target: 2, unit: "times", forKids: true, forGrownUps: true },
  { title: "Play or move for 30 minutes", category: "move", target: 1, unit: "times", forKids: true, forGrownUps: true },
  { title: "Eat a fruit or vegetable", category: "food", target: 2, unit: "servings", forKids: true, forGrownUps: true },
  { title: "In bed on time", category: "sleep", target: 1, unit: "night", forKids: true, forGrownUps: true },
];

const SAMPLE_REWARDS: { title: string; cost: number }[] = [
  { title: "Pick the family movie", cost: 30 },
  { title: "Extra 30 minutes of screen time", cost: 40 },
  { title: "Ice cream treat", cost: 50 },
  { title: "Choose Sunday lunch", cost: 60 },
];

export async function startSampleGameAction(): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up sets up the game." };
  const supabase = await createClient();
  const { count } = await supabase.from("planner_goals").select("id", { count: "exact", head: true }).eq("family_id", me.family_id).not("category", "is", null);
  if ((count ?? 0) > 0) return { error: "This household already has game goals." };
  const { data: members } = await supabase.from("members").select("id, role").eq("family_id", me.family_id).not("status", "in", "(pending,removed)");

  const goals: TablesInsert<"planner_goals">[] = (members ?? []).flatMap((m) =>
    SAMPLE_GOALS.filter((g) => (isGrownUp(m.role) ? g.forGrownUps : g.forKids)).map((g) => ({
      family_id: me.family_id,
      title: g.title,
      kind: "custom",
      category: g.category,
      period: "day",
      target: g.target,
      unit: g.unit,
      owner_member_id: m.id,
      xp: DEFAULT_GOAL_XP,
      points: DEFAULT_GOAL_COINS,
      created_by: me.id,
    })),
  );
  goals.push({ family_id: me.family_id, title: "Family walk", kind: "custom", category: "family", period: "week", target: 2, unit: "walks", owner_member_id: null, xp: 0, points: 0, created_by: me.id });
  const { error } = await supabase.from("planner_goals").insert(goals);
  if (error) return { error: humanDatabaseError(error.message) };

  const { data: existing } = await supabase.from("rewards").select("title").eq("family_id", me.family_id).eq("active", true);
  const have = new Set((existing ?? []).map((r) => r.title.toLowerCase()));
  const rewards = SAMPLE_REWARDS.filter((r) => !have.has(r.title.toLowerCase())).map((r) => ({ family_id: me.family_id, title: r.title, cost_points: r.cost, created_by: me.id }));
  if (rewards.length) {
    const { error: rewardError } = await supabase.from("rewards").insert(rewards);
    if (rewardError) return { error: humanDatabaseError(rewardError.message) };
  }
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
  if (error) return { error: humanDatabaseError(error.message) };

  // The day as the game counts it: the larger of typed and synced.
  const { data: days } = await supabase.rpc("game_steps_days", { p_from: today, p_to: today });
  const steps = Number((days ?? []).find((d) => d.member_id === owner)?.steps ?? next);
  const reached = new Set(stepParts(steps, Number(goal.target)));
  const { data: claimed } = await supabase.from("planner_goal_completions").select("part, status").eq("goal_id", goal.id).eq("period_start", today);
  const have = new Set((claimed ?? []).map((c) => c.part));
  for (const part of ["half", "rest"] as const) {
    if (reached.has(part) && !have.has(part)) {
      const { error: claimError } = await supabase.from("planner_goal_completions").insert({ family_id: me.family_id, goal_id: goal.id, member_id: owner, period_start: today, part });
      if (claimError) return { error: humanDatabaseError(claimError.message) };
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
  if (!isGrownUp(me.role)) return { error: "Game goals are a grown-up's to set up." };
  if (!readAccess(me.families).plus) return { error: "Steps are part of Kin Plus." };
  const title = clamp(String(formData.get("title") ?? "").trim(), 80) || "Steps";
  const xp = Math.round(Number(formData.get("xp") ?? DEFAULT_GOAL_XP));
  const points = Math.round(Number(formData.get("points") ?? DEFAULT_GOAL_COINS));
  const who = formData.getAll("who").map(String);
  if (!(xp >= 0 && xp <= MAX_GOAL_XP) || !(points >= 0 && points <= 1000)) return { error: "XP and coins are from 0 to 1,000." };
  if (who.length === 0) return { error: "Choose who it is for." };
  const sane = (n: number, max: number) => Number.isInteger(n) && n >= 100 && n <= max;

  const base = { family_id: me.family_id, title, kind: "steps", unit: "steps", created_by: me.id };
  let rows: TablesInsert<"planner_goals">[];
  if (who.includes("family")) {
    const target = Number(formData.get("family_target"));
    if (!sane(target, 5_000_000)) return { error: "The family's weekly target is from 100 to 5,000,000 steps." };
    rows = [{ ...base, category: "family", period: "week", target, owner_member_id: null, xp: 0, points: 0 }];
  } else {
    rows = [];
    for (const id of who) {
      const target = Number(formData.get(`target_${id}`));
      if (!sane(target, 100_000)) return { error: "Each daily target is from 100 to 100,000 steps." };
      rows.push({ ...base, category: "move", period: "day", target, owner_member_id: id, xp, points });
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.from("planner_goals").insert(rows);
  if (error) return { error: humanDatabaseError(error.message) };
  done();
  return { error: null, saved: rows.length };
}
