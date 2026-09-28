import { createClient } from "@/lib/supabase/server";
import { familyDay } from "@/lib/time";
import { clamp01, isGoalKind, isGoalPeriod, weightFraction, windowStart, type GoalKind, type GoalPeriod } from "@/lib/goals";

export type GoalRewardView = {
  title: string;
  status: "pending" | "approved" | "refused";
  proposedBy: string | null;
  proposedById: string | null;
  decidedBy: string | null;
  /** The viewer may answer it: a grown-up who is not the person it is for,
   * and on a household goal not the one who asked. The policy is the real
   * rule; this only decides whether the buttons are shown. */
  canAnswer: boolean;
};

export type GoalView = {
  id: string;
  title: string;
  kind: GoalKind;
  period: GoalPeriod;
  target: number;
  unit: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  createdById: string | null;
  /** Where the ring stands, in the goal's own units. For weight, the latest
   * reading. */
  current: number;
  /** Weight: where it started. */
  start: number | null;
  fraction: number;
  reached: boolean;
  /** Money: filled from this savings goal rather than from entries. */
  savingsTitle: string | null;
  /** Nothing to read yet (a weight goal with no reading, say). */
  noData: boolean;
  reward: GoalRewardView | null;
};

type Viewer = { id: string; role: string };

function mayAnswer(viewer: Viewer, ownerId: string | null, proposedById: string | null): boolean {
  if (viewer.role !== "parent" && viewer.role !== "adult") return false;
  if (ownerId) return ownerId !== viewer.id;
  return proposedById !== viewer.id;
}

/** Every goal in the household, with its ring filled from what Kin already
 * holds. A handful of reads for the whole list, not one per goal. */
export async function getGoals(familyId: string, viewer: Viewer, weekStart: 0 | 1): Promise<GoalView[]> {
  const supabase = await createClient();
  const [{ data: goals }, { data: rewards }, { data: members }] = await Promise.all([
    supabase.from("planner_goals").select("*").eq("family_id", familyId).order("created_at", { ascending: true }),
    supabase.from("planner_goal_rewards").select("*").eq("family_id", familyId),
    supabase.from("members").select("id, full_name").eq("family_id", familyId),
  ]);
  if (!goals || goals.length === 0) return [];

  const nameOf = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const rewardOf = new Map((rewards ?? []).map((r) => [r.goal_id, r]));
  const today = familyDay();

  const withWindow = goals
    .filter((g) => isGoalKind(g.kind) && isGoalPeriod(g.period))
    .map((g) => ({ ...g, kind: g.kind as GoalKind, period: g.period as GoalPeriod, from: windowStart(g.period as GoalPeriod, today, weekStart, familyDay(new Date(g.created_at))) }));
  const earliest = withWindow.reduce((min, g) => (g.from < min ? g.from : min), today);

  const has = (k: GoalKind) => withWindow.some((g) => g.kind === k);
  const savingsIds = withWindow.map((g) => g.savings_goal_id).filter((v): v is string => !!v);
  const weightOwners = [...new Set(withWindow.filter((g) => g.kind === "weight" && g.owner_member_id).map((g) => g.owner_member_id as string))];

  const [entriesRes, waterRes, stepsRes, weightRes, savingsRes] = await Promise.all([
    supabase.from("planner_goal_entries").select("goal_id, entry_date, amount").eq("family_id", familyId).gte("entry_date", earliest),
    has("water")
      ? supabase.from("liquid_intake_log").select("member_id, log_date, glasses").eq("family_id", familyId).eq("type", "water").gte("log_date", earliest)
      : Promise.resolve({ data: [] as { member_id: string; log_date: string; glasses: number }[] }),
    has("steps")
      ? supabase.from("health_vitals").select("member_id, reading_date, value_text").eq("family_id", familyId).eq("vital_type", "steps").gte("reading_date", earliest)
      : Promise.resolve({ data: [] as { member_id: string; reading_date: string; value_text: string }[] }),
    weightOwners.length > 0
      ? supabase.from("health_vitals").select("member_id, reading_date, value_text, created_at").eq("family_id", familyId).eq("vital_type", "weight").in("member_id", weightOwners).order("reading_date", { ascending: false }).order("created_at", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] as { member_id: string; reading_date: string; value_text: string; created_at: string }[] }),
    savingsIds.length > 0
      ? supabase.from("goals").select("id, title, current_amount").in("id", savingsIds)
      : Promise.resolve({ data: [] as { id: string; title: string; current_amount: number }[] }),
  ]);

  const entries = entriesRes.data ?? [];
  const water = waterRes.data ?? [];
  const steps = stepsRes.data ?? [];
  const weights = weightRes.data ?? [];
  const savings = new Map((savingsRes.data ?? []).map((s) => [s.id, s]));

  return withWindow.map((g) => {
    const counts = (memberId: string | null) => g.owner_member_id === null || memberId === g.owner_member_id;
    let current = 0;
    let start: number | null = null;
    let fraction = 0;
    let noData = false;
    let savingsTitle: string | null = null;

    if (g.kind === "water") {
      current = water.filter((w) => w.log_date >= g.from && counts(w.member_id)).reduce((sum, w) => sum + w.glasses, 0);
    } else if (g.kind === "steps") {
      current = steps.filter((s) => s.reading_date >= g.from && counts(s.member_id)).reduce((sum, s) => sum + (parseFloat(s.value_text) || 0), 0);
    } else if (g.kind === "weight") {
      const mine = weights.filter((w) => w.member_id === g.owner_member_id).map((w) => ({ date: w.reading_date, value: parseFloat(w.value_text) })).filter((w) => w.value > 0);
      // Newest first. Where the goal started is what it was set with, or else
      // the first reading since it was made.
      const latest = mine[0]?.value ?? null;
      start = g.start_value ?? [...mine].reverse().find((w) => w.date >= g.from)?.value ?? null;
      noData = latest === null;
      current = latest ?? 0;
      fraction = weightFraction(start, latest, g.target);
    } else if (g.kind === "money" && g.savings_goal_id && savings.has(g.savings_goal_id)) {
      const s = savings.get(g.savings_goal_id)!;
      current = Number(s.current_amount) || 0;
      savingsTitle = s.title;
    } else {
      current = entries.filter((e) => e.goal_id === g.id && e.entry_date >= g.from).reduce((sum, e) => sum + Number(e.amount), 0);
    }
    if (g.kind !== "weight") fraction = clamp01(current / g.target);

    const r = rewardOf.get(g.id);
    return {
      id: g.id,
      title: g.title,
      kind: g.kind,
      period: g.period,
      target: Number(g.target),
      unit: g.unit,
      ownerId: g.owner_member_id,
      ownerName: g.owner_member_id ? (nameOf.get(g.owner_member_id) ?? null) : null,
      dueDate: g.due_date,
      createdById: g.created_by,
      current,
      start,
      fraction,
      reached: fraction >= 1,
      savingsTitle,
      noData,
      reward: r
        ? {
            title: r.title,
            status: r.status as GoalRewardView["status"],
            proposedBy: r.proposed_by ? (nameOf.get(r.proposed_by) ?? null) : null,
            proposedById: r.proposed_by,
            decidedBy: r.decided_by ? (nameOf.get(r.decided_by) ?? null) : null,
            canAnswer: r.status === "pending" && mayAnswer(viewer, g.owner_member_id, r.proposed_by),
          }
        : null,
    };
  });
}

export type PendingGoalReward = { goalId: string; goalTitle: string; reward: string; forWhom: string; askedBy: string | null };

/** Rewards waiting on the viewer's yes, for the queue on Today. Only the
 * ones this viewer may answer: showing a parent their own reward with an
 * Approve button the database will refuse would be a button that lies. */
export async function getPendingGoalRewards(familyId: string, viewer: Viewer): Promise<PendingGoalReward[]> {
  if (viewer.role !== "parent" && viewer.role !== "adult") return [];
  const supabase = await createClient();
  const { data: rewards } = await supabase
    .from("planner_goal_rewards")
    .select("goal_id, title, proposed_by, created_at")
    .eq("family_id", familyId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!rewards || rewards.length === 0) return [];

  const [{ data: goals }, { data: members }] = await Promise.all([
    supabase.from("planner_goals").select("id, title, owner_member_id").in("id", rewards.map((r) => r.goal_id)),
    supabase.from("members").select("id, full_name").eq("family_id", familyId),
  ]);
  const goalOf = new Map((goals ?? []).map((g) => [g.id, g]));
  const nameOf = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  return rewards.flatMap((r) => {
    const g = goalOf.get(r.goal_id);
    if (!g || !mayAnswer(viewer, g.owner_member_id, r.proposed_by)) return [];
    return [{
      goalId: g.id,
      goalTitle: g.title,
      reward: r.title,
      forWhom: g.owner_member_id ? (nameOf.get(g.owner_member_id) ?? "Someone") : "Everyone",
      askedBy: r.proposed_by ? (nameOf.get(r.proposed_by) ?? null) : null,
    }];
  });
}
