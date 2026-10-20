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
import { PACK_FAMILY_GOALS, PACK_GOALS, PACK_REWARDS, PACK_ROLE_LABEL, packGoalsFor, type PackGoal, type PackRole } from "@/lib/family-pack";
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
  if (error) return { error: humanDatabaseError(error.message) };
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

/** The family starter pack (lib/family-pack), into the caller's own
 * household: a grown-up says who is who, and the pack adds their goals,
 * the family's weekly goals (the stroller walk linked to the baby's
 * outdoor time) and, if asked, the rewards. Steps goals need Kin Plus and
 * are left out without it. Anything already there by the same name is left
 * alone. */
export async function addFamilyPackAction(roles: Partial<Record<PackRole, string>>, withRewards: boolean): Promise<{ error: string | null; added?: number; skippedForPlus?: number }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up sets up the family's goals." };
  const supabase = await createClient();
  const { data: members } = await supabase.from("members").select("id, role").eq("family_id", me.family_id).not("status", "in", "(pending,removed)");
  const roleOf = new Map((members ?? []).map((m) => [m.id, m.role]));
  const chosen = Object.entries(roles).filter(([, id]) => id) as [PackRole, string][];
  if (chosen.length === 0) return { error: "Choose at least one person." };
  if (new Set(chosen.map(([, id]) => id)).size !== chosen.length) return { error: "Choose a different person for each." };
  for (const [role, id] of chosen) {
    const r = roleOf.get(id);
    if (!r) return { error: "That person is not in this household." };
    if ((role === "mum" || role === "dad") && !isGrownUp(r)) return { error: `${PACK_ROLE_LABEL[role]} has to be a grown-up.` };
    if ((role === "child" || role === "baby") && r !== "child_managed" && r !== "child_self") return { error: `${PACK_ROLE_LABEL[role]} has to be a child.` };
  }
  if (roles.baby && roleOf.get(roles.baby) !== "child_managed") return { error: "The baby's goals are ticked by a grown-up, so the baby has to be a child without a login." };

  const { data: existing } = await supabase.from("planner_goals").select("owner_member_id, title").eq("family_id", me.family_id).not("category", "is", null).is("removed_at", null);
  const plus = readAccess(me.families).plus;
  const { personal, family, skippedForPlus } = packGoalsFor(roles, { plus, existing: (existing ?? []).map((e) => ({ ownerId: e.owner_member_id, title: e.title })) });
  const row = (g: PackGoal, owner: string | null): TablesInsert<"planner_goals"> => ({
    family_id: me.family_id,
    title: g.title,
    kind: g.kind,
    category: g.category,
    period: g.period,
    target: g.target,
    unit: g.unit,
    owner_member_id: owner,
    xp: owner ? g.xp : 0,
    points: owner ? g.coins : 0,
    days: g.days ?? null,
    backup: g.backup ?? false,
    credit_to: owner ? (g.creditTo ?? "owner") : "owner",
    emoji: g.emoji ?? null,
    created_by: me.id,
  });
  const rows = [...personal.map((g) => row(g, g.owner)), ...family.map((g) => row(g, null))];
  let added = 0;
  if (rows.length > 0) {
    const { data: made, error } = await supabase.from("planner_goals").insert(rows).select("id, title, owner_member_id");
    if (error) return { error: humanDatabaseError(error.message) };
    added = made?.length ?? 0;
  }

  // The stroller walk, logged once, also ticks the baby's outdoor time.
  if (roles.baby) {
    const { data: goals } = await supabase.from("planner_goals").select("id, title, owner_member_id").eq("family_id", me.family_id).is("removed_at", null).not("category", "is", null);
    const walk = (goals ?? []).find((g) => g.owner_member_id === null && g.title === PACK_FAMILY_GOALS.find((f) => f.stroller)!.title);
    const outdoor = (goals ?? []).find((g) => g.owner_member_id === roles.baby && g.title === PACK_GOALS.baby.find((b) => b.strollerLinked)!.title);
    if (walk && outdoor) {
      await supabase.from("planner_goal_links").upsert({ goal_id: walk.id, linked_goal_id: outdoor.id, family_id: me.family_id, created_by: me.id }, { onConflict: "goal_id,linked_goal_id", ignoreDuplicates: true });
    }
  }

  if (withRewards) {
    const { data: have } = await supabase.from("rewards").select("title").eq("family_id", me.family_id).eq("active", true);
    const taken = new Set((have ?? []).map((r) => r.title.toLowerCase()));
    const rewards = [...(roles.child ? PACK_REWARDS.child : []), ...PACK_REWARDS.grownUps, ...PACK_REWARDS.family]
      .filter((r) => !taken.has(r.title.toLowerCase()))
      .map((r) => ({ family_id: me.family_id, title: r.title, cost_points: r.coins, budget_amount: r.budget ?? null, unlock: r.unlock ?? null, created_by: me.id }));
    if (rewards.length > 0) {
      const { error } = await supabase.from("rewards").insert(rewards);
      if (error) return { error: humanDatabaseError(error.message) };
    }
  }
  done();
  return { error: null, added, skippedForPlus };
}

/** Editing a game goal. Its name, worth, days, category and picture change
 * in place. What it measures (the target) does not -- a claim already made
 * was for the old one -- so a new target makes a new goal, carrying the
 * links over, and removes the old (its earnings stay). */
export async function updateGameGoalAction(goalId: string, formData: FormData): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Game goals are a grown-up's to change." };
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
  const changes = { title, category, xp: owned ? xp : 0, points: owned ? points : 0, emoji, days };

  if (target === Number(goal.target)) {
    const { error } = await supabase.from("planner_goals").update(changes).eq("id", goal.id).eq("family_id", me.family_id);
    if (error) return { error: humanDatabaseError(error.message) };
  } else {
    const { id: _old, created_at: _at, ...rest } = goal;
    void _old;
    void _at;
    const { data: made, error } = await supabase.from("planner_goals").insert({ ...rest, ...changes, target, created_by: me.id }).select("id").single();
    if (error) return { error: humanDatabaseError(error.message) };
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
    if (removeError) return { error: humanDatabaseError(removeError.message) };
  }
  done();
  return { error: null };
}

/** Removed, not deleted (20261020190000): it leaves every list, and what it
 * earned stays earned. */
export async function removeGameGoalAction(goalId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Game goals are a grown-up's to remove." };
  const supabase = await createClient();
  const { error } = await supabase.from("planner_goals").update({ active: false, removed_at: new Date().toISOString() }).eq("id", goalId).eq("family_id", me.family_id).not("category", "is", null);
  if (error) return { error: humanDatabaseError(error.message) };
  done();
  return { error: null };
}

/** The family-week treat, enjoyed: marked by a grown-up, once a week
 * (game_use_family_treat checks the role and the week again). */
export async function markFamilyTreatAction(week: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A grown-up marks the family treat." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("game_use_family_treat", { p_week: week });
  if (error) return { error: humanDatabaseError(error.message) };
  done();
  return { error: null };
}
