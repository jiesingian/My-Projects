import { createClient } from "@/lib/supabase/server";
import { familyDay } from "@/lib/time";
import { clamp01, isGoalKind, isGoalPeriod, weightFraction, windowStart, type GoalKind, type GoalPeriod } from "@/lib/goals";

export type GoalRewardView = {
  title: string;
  status: "pending" | "approved" | "refused" | "claimed" | "given" | "received";
  proposedBy: string | null;
  proposedById: string | null;
  /** Who keeps the promise -- a parent, another adult or a child. */
  giverId: string | null;
  giverName: string | null;
  /** The viewer is the giver. Only the giver answers, rewords or marks it
   * given; the policy is the real rule, this decides what is shown. */
  viewerGives: boolean;
  /** The viewer receives it: the goal's owner, or on a household goal anyone
   * but the giver. The receiver claims it and confirms it arrived. */
  viewerReceives: boolean;
  /** When the giver has to give it by (claimed), or the receiver to confirm
   * by (given). Past it, Kin chases the giver every five minutes. */
  dueAt: string | null;
  overdue: boolean;
};

/** A change to what a goal measures, waiting for the giver's yes. */
export type GoalChangeView = {
  id: string;
  proposedBy: string | null;
  /** "Target 12 → 10 books", one line per field. */
  lines: string[];
  canAnswer: boolean;
  viewerAsked: boolean;
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
  change: GoalChangeView | null;
};

type Viewer = { id: string; role: string };

/** A reward still in play: asked for or promised. Only then does changing
 * the goal need anyone's yes. */
function inPlay(status: string | undefined): boolean {
  return status === "pending" || status === "approved" || status === "claimed" || status === "given";
}

/** Every goal in the household, with its ring filled from what Kin already
 * holds. A handful of reads for the whole list, not one per goal. */
export async function getGoals(familyId: string, viewer: Viewer, weekStart: 0 | 1): Promise<GoalView[]> {
  const supabase = await createClient();
  const [{ data: goals }, { data: rewards }, { data: members }, { data: changes }] = await Promise.all([
    supabase.from("planner_goals").select("*").eq("family_id", familyId).order("created_at", { ascending: true }),
    supabase.from("planner_goal_rewards").select("*").eq("family_id", familyId),
    supabase.from("members").select("id, full_name").eq("family_id", familyId),
    supabase.from("planner_goal_changes").select("*").eq("family_id", familyId).eq("status", "pending").order("created_at", { ascending: false }),
  ]);
  if (!goals || goals.length === 0) return [];

  const nameOf = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const rewardOf = new Map((rewards ?? []).map((r) => [r.goal_id, r]));
  // The newest request per goal; an older one still waiting is answered
  // after it.
  const changeOf = new Map<string, NonNullable<typeof changes>[number]>();
  for (const c of changes ?? []) if (!changeOf.has(c.goal_id)) changeOf.set(c.goal_id, c);
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
    const c = changeOf.get(g.id);
    const giverInPlay = r && inPlay(r.status) ? r.giver_member_id : null;
    const viewerGives = !!r?.giver_member_id && r.giver_member_id === viewer.id;
    const viewerReceives = !!r && !viewerGives && (g.owner_member_id === null || g.owner_member_id === viewer.id);
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
            giverId: r.giver_member_id,
            giverName: r.giver_member_id ? (nameOf.get(r.giver_member_id) ?? null) : null,
            viewerGives,
            viewerReceives,
            dueAt: r.due_at,
            overdue: !!r.due_at && new Date(r.due_at).getTime() <= Date.now(),
          }
        : null,
      change: c
        ? {
            id: c.id,
            proposedBy: c.proposed_by ? (nameOf.get(c.proposed_by) ?? null) : null,
            lines: describeChange(c, g),
            // The other side of the promise answers while a reward is in
            // play: the giver, or -- when the giver asked -- whoever receives
            // it. With none in play, anyone but the one who asked.
            canAnswer: giverInPlay
              ? c.proposed_by === giverInPlay
                ? viewer.id !== giverInPlay && (g.owner_member_id === null || g.owner_member_id === viewer.id)
                : giverInPlay === viewer.id
              : c.proposed_by !== viewer.id,
            viewerAsked: c.proposed_by === viewer.id,
          }
        : null,
    };
  });
}

type ChangeRow = { title: string | null; target: number | null; period: string | null; unit: string | null; due_date: string | null; change_due_date: boolean };
type GoalRow = { title: string; target: number; period: string; unit: string | null; due_date: string | null };

const PERIOD_WORD: Record<string, string> = { day: "a day", week: "a week", month: "a month", total: "in all" };

/** What a change request would do, in words: "Target 12 → 10". */
export function describeChange(c: ChangeRow, g: GoalRow): string[] {
  const lines: string[] = [];
  if (c.title !== null && c.title !== g.title) lines.push(`Name “${g.title}” → “${c.title}”`);
  if (c.target !== null && Number(c.target) !== Number(g.target)) lines.push(`Target ${Number(g.target).toLocaleString("en-PH")} → ${Number(c.target).toLocaleString("en-PH")}`);
  if (c.period !== null && c.period !== g.period) lines.push(`Counted ${PERIOD_WORD[g.period] ?? g.period} → ${PERIOD_WORD[c.period] ?? c.period}`);
  if (c.unit !== null && c.unit !== g.unit) lines.push(`Counting “${g.unit ?? ""}” → “${c.unit}”`);
  if (c.change_due_date && c.due_date !== g.due_date) lines.push(`By ${g.due_date ?? "no date"} → ${c.due_date ?? "no date"}`);
  return lines.length > 0 ? lines : ["No change to what it measures"];
}

export type PendingGoalReward = { goalId: string; goalTitle: string; reward: string; forWhom: string; askedBy: string | null };
export type PendingGoalChange = { changeId: string; goalTitle: string; askedBy: string | null; lines: string[] };

/** What is waiting on this viewer's yes, for the queue on Today: rewards
 * they have been asked to give, and changes to goals whose reward they
 * give. Anyone can be a giver -- a child promising a hug counts as much as
 * a parent promising ₱500 -- so this is not limited to grown-ups. */
export async function getGoalRequestsFor(familyId: string, viewer: Viewer): Promise<{ rewards: PendingGoalReward[]; changes: PendingGoalChange[] }> {
  const supabase = await createClient();
  const [{ data: rewards }, { data: changes }] = await Promise.all([
    supabase.from("planner_goal_rewards").select("goal_id, title, proposed_by, giver_member_id, status, created_at").eq("family_id", familyId).in("status", ["pending", "approved", "claimed", "given"]),
    supabase.from("planner_goal_changes").select("*").eq("family_id", familyId).eq("status", "pending").order("created_at", { ascending: true }),
  ]);
  const asked = (rewards ?? []).filter((r) => r.status === "pending" && r.giver_member_id === viewer.id);
  const giverOf = new Map((rewards ?? []).map((r) => [r.goal_id, r.giver_member_id]));
  // A change the giver asked for goes to the receiving side; any other to the
  // giver. Whether this viewer receives is settled against the goal below.
  const candidates = (changes ?? []).filter((c) => giverOf.has(c.goal_id) && c.proposed_by !== viewer.id);
  if (asked.length === 0 && candidates.length === 0) return { rewards: [], changes: [] };

  const goalIds = [...new Set([...asked.map((r) => r.goal_id), ...candidates.map((c) => c.goal_id)])];
  if (goalIds.length === 0) return { rewards: [], changes: [] };
  const [{ data: goals }, { data: members }] = await Promise.all([
    supabase.from("planner_goals").select("id, title, owner_member_id, target, period, unit, due_date").in("id", goalIds),
    supabase.from("members").select("id, full_name").eq("family_id", familyId),
  ]);
  const goalOf = new Map((goals ?? []).map((g) => [g.id, g]));
  const nameOf = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  return {
    rewards: asked.flatMap((r) => {
      const g = goalOf.get(r.goal_id);
      if (!g) return [];
      return [{
        goalId: g.id,
        goalTitle: g.title,
        reward: r.title,
        forWhom: g.owner_member_id ? (nameOf.get(g.owner_member_id) ?? "Someone") : "Everyone",
        askedBy: r.proposed_by ? (nameOf.get(r.proposed_by) ?? null) : null,
      }];
    }),
    changes: candidates.flatMap((c) => {
      const g = goalOf.get(c.goal_id);
      if (!g) return [];
      const giver = giverOf.get(c.goal_id);
      const mine = c.proposed_by === giver ? viewer.id !== giver && (g.owner_member_id === null || g.owner_member_id === viewer.id) : giver === viewer.id;
      if (!mine) return [];
      return [{ changeId: c.id, goalTitle: g.title, askedBy: c.proposed_by ? (nameOf.get(c.proposed_by) ?? null) : null, lines: describeChange(c, g) }];
    }),
  };
}

export type RewardDuty = {
  goalId: string;
  goalTitle: string;
  reward: string;
  /** owe: the viewer promised it and the goal was reached. confirm: it was
   * marked given to the viewer, who says whether it arrived. */
  kind: "owe" | "confirm";
  other: string;
  dueAt: string | null;
  overdue: boolean;
  state: "claimed" | "given";
};

/** What a promise asks of this viewer right now, for the banner on Today
 * that cannot be dismissed: rewards they owe (claimed, or given but not yet
 * confirmed), and rewards given to them waiting for their word. */
export async function getRewardDuties(familyId: string, viewer: Viewer): Promise<RewardDuty[]> {
  const supabase = await createClient();
  const { data: rewards } = await supabase
    .from("planner_goal_rewards")
    .select("goal_id, title, status, giver_member_id, due_at")
    .eq("family_id", familyId)
    .in("status", ["claimed", "given"]);
  if (!rewards || rewards.length === 0) return [];
  const [{ data: goals }, { data: members }] = await Promise.all([
    supabase.from("planner_goals").select("id, title, owner_member_id").in("id", rewards.map((r) => r.goal_id)),
    supabase.from("members").select("id, full_name").eq("family_id", familyId),
  ]);
  const goalOf = new Map((goals ?? []).map((g) => [g.id, g]));
  const first = (id: string | null) => (id ? ((members ?? []).find((m) => m.id === id)?.full_name.split(" ")[0] ?? "Someone") : "Everyone");
  const now = Date.now();

  return rewards.flatMap((r): RewardDuty[] => {
    const g = goalOf.get(r.goal_id);
    if (!g) return [];
    const overdue = !!r.due_at && new Date(r.due_at).getTime() <= now;
    const base = { goalId: g.id, goalTitle: g.title, reward: r.title, dueAt: r.due_at, overdue, state: r.status as "claimed" | "given" };
    if (r.giver_member_id === viewer.id) return [{ ...base, kind: "owe" as const, other: first(g.owner_member_id) }];
    const receives = g.owner_member_id === null ? r.giver_member_id !== viewer.id : g.owner_member_id === viewer.id;
    if (receives && r.status === "given") return [{ ...base, kind: "confirm" as const, other: first(r.giver_member_id) }];
    return [];
  });
}
