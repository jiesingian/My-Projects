import { createClient } from "@/lib/supabase/server";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { windowStart, clamp01 } from "@/lib/goals";
import { getMemberScores } from "@/lib/queries/routines";
import { asksOn, isGameCategory, levelFromXp, xpTotal, type GameCategory } from "@/lib/game";
import type { WeekStart } from "@/lib/week";

/** Planner → Goals → Game: everything its screens show, read once.
 *
 * Nothing here is stored as a total. XP is summed from claims and bonuses
 * (lib/game xpTotal), coins are the points balance (loadPoints), a level is
 * computed from XP; streaks and badges are what the nightly job wrote
 * (20261020120000). */

type ClaimStatus = "counted" | "pending" | "refused";

export type GameGoalView = {
  id: string;
  title: string;
  /** Counted by taps, or steps (20261020150000): a person's daily steps, or
   * the household's weekly total. */
  type: "tap" | "steps";
  category: GameCategory;
  period: "day" | "week";
  target: number;
  unit: string | null;
  ownerId: string | null;
  xp: number;
  points: number;
  active: boolean;
  periodStart: string;
  current: number;
  fraction: number;
  reached: boolean;
  /** This period's claim -- for steps, the one at 100% ("rest"). */
  claim: ClaimStatus | null;
  /** Steps only: the claim at 50%. */
  half: ClaimStatus | null;
  /** ISO weekdays it is asked for (1 = Monday); null: every day. */
  days: number[] | null;
  /** A busy day's backup (20261020210000). */
  backup: boolean;
  /** Whose the XP and coins are: the owner's, or whoever ticked it. */
  creditTo: "owner" | "logger";
  /** A child's sticker. */
  emoji: string | null;
};

export type PlayerView = {
  id: string;
  name: string;
  role: string;
  xp: number;
  /** XP in claims still waiting for a grown-up's yes. */
  xpWaiting: number;
  level: ReturnType<typeof levelFromXp>;
  coins: number;
  streak: number;
  bestStreak: number;
  freezes: number;
  goals: GameGoalView[];
  dailiesTotal: number;
  dailiesDone: number;
  badges: { id: string; earnedOn: string }[];
};

export type BadgeView = { id: string; title: string; icon: string; description: string };

export type GameView = {
  today: string;
  players: PlayerView[];
  familyGoals: GameGoalView[];
  familyStreak: number;
  familyBest: number;
  badges: BadgeView[];
  /** Any game goal at all in the household (for the empty state). */
  hasGoals: boolean;
};

export async function getGame(familyId: string, weekStart: WeekStart): Promise<GameView> {
  const supabase = await createClient();
  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  const weekFrom = windowStart("week", today, weekStart, today);

  const [{ data: members }, { data: goals }, { data: claims }, { data: awards }, { data: streaks }, { data: family }, { data: badges }, { data: earned }, scores] = await Promise.all([
    supabase.from("members").select("id, full_name, role, status").eq("family_id", familyId).not("status", "in", "(pending,removed)").order("created_at"),
    supabase
      .from("planner_goals")
      .select("id, title, kind, category, period, target, unit, owner_member_id, xp, points, active, created_at, days, backup, credit_to, emoji")
      .eq("family_id", familyId)
      .not("category", "is", null)
      // Removed goals keep what they earned, and are seen no more.
      .is("removed_at", null)
      .order("created_at"),
    supabase.from("planner_goal_completions").select("goal_id, member_id, credited_to, period_start, xp, status, part").eq("family_id", familyId),
    supabase.from("game_awards").select("member_id, xp").eq("family_id", familyId),
    supabase.from("game_streaks").select("member_id, streak, best_streak, freezes").eq("family_id", familyId),
    supabase.from("game_family_streaks").select("streak, best_streak").eq("family_id", familyId).maybeSingle(),
    supabase.from("game_badges").select("id, title, icon, description").order("sort"),
    supabase.from("game_member_badges").select("member_id, badge_id, earned_on").eq("family_id", familyId),
    getMemberScores(familyId),
  ]);

  const goalIds = (goals ?? []).filter((g) => g.kind !== "steps").map((g) => g.id);
  const hasSteps = (goals ?? []).some((g) => g.kind === "steps" && g.owner_member_id);
  const hasFamilySteps = (goals ?? []).some((g) => g.kind === "steps" && !g.owner_member_id);
  const [{ data: entries }, { data: stepDays }, { data: familySteps }] = await Promise.all([
    goalIds.length
      ? supabase.from("planner_goal_entries").select("goal_id, entry_date, amount").in("goal_id", goalIds).gte("entry_date", weekFrom < today ? weekFrom : today)
      : Promise.resolve({ data: [] as { goal_id: string; entry_date: string; amount: number }[] }),
    // Steps as the game counts them (20261020150000): today's, per person.
    hasSteps ? supabase.rpc("game_steps_days", { p_from: today, p_to: today }) : Promise.resolve({ data: [] as { member_id: string; day: string; steps: number }[] }),
    hasFamilySteps ? supabase.rpc("game_family_steps", { p_from: weekFrom, p_to: today }) : Promise.resolve({ data: 0 }),
  ]);

  const views: GameGoalView[] = [];
  for (const g of goals ?? []) {
    if (!g.category || !isGameCategory(g.category) || (g.period !== "day" && g.period !== "week")) continue;
    const start = windowStart(g.period, today, weekStart, today);
    const steps = g.kind === "steps";
    const current = steps
      ? g.owner_member_id
        ? Number((stepDays ?? []).find((d) => d.member_id === g.owner_member_id)?.steps ?? 0)
        : Number(familySteps ?? 0)
      : (entries ?? []).filter((e) => e.goal_id === g.id && e.entry_date >= start && e.entry_date <= today).reduce((a, e) => a + Number(e.amount), 0);
    const claimOf = (part: string) => ((claims ?? []).find((c) => c.goal_id === g.id && c.period_start === start && c.part === part)?.status as ClaimStatus | undefined) ?? null;
    const target = Number(g.target);
    views.push({
      id: g.id,
      title: g.title,
      type: steps ? "steps" : "tap",
      category: g.category,
      period: g.period,
      target,
      unit: g.unit,
      ownerId: g.owner_member_id,
      xp: g.xp,
      points: g.points,
      active: g.active,
      periodStart: start,
      current,
      fraction: clamp01(current / target),
      reached: current >= target,
      claim: claimOf(steps ? "rest" : "whole"),
      days: g.days,
      backup: g.backup,
      creditTo: g.credit_to === "logger" ? "logger" : "owner",
      emoji: g.emoji,
      half: steps ? claimOf("half") : null,
    });
  }

  const players: PlayerView[] = (members ?? []).map((m) => {
    const mine = views.filter((g) => g.ownerId === m.id);
    // Today's dailies: asked for today, backups aside (20261020210000).
    const dailies = mine.filter((g) => g.active && g.period === "day" && !g.backup && asksOn(g.days, today));
    // XP is whose the claim credits: a baby's goal ticked by a grown-up is
    // the grown-up's XP, the baby's progress.
    const myClaims = (claims ?? []).filter((c) => (c.credited_to ?? c.member_id) === m.id);
    const xp = xpTotal(myClaims, (awards ?? []).filter((a) => a.member_id === m.id));
    const s = (streaks ?? []).find((r) => r.member_id === m.id);
    return {
      id: m.id,
      name: m.full_name,
      role: m.role,
      xp,
      xpWaiting: myClaims.filter((c) => c.status === "pending").reduce((a, c) => a + c.xp, 0),
      level: levelFromXp(xp),
      coins: scores.find((sc) => sc.id === m.id)?.spendable ?? 0,
      streak: s?.streak ?? 0,
      bestStreak: s?.best_streak ?? 0,
      freezes: s?.freezes ?? 1,
      goals: mine,
      dailiesTotal: dailies.length,
      dailiesDone: dailies.filter((g) => g.claim === "counted" || g.claim === "pending").length,
      badges: (earned ?? []).filter((b) => b.member_id === m.id).map((b) => ({ id: b.badge_id, earnedOn: b.earned_on })),
    };
  });

  return {
    today,
    players,
    familyGoals: views.filter((g) => g.ownerId === null),
    familyStreak: family?.streak ?? 0,
    familyBest: family?.best_streak ?? 0,
    badges: badges ?? [],
    hasGoals: views.length > 0,
  };
}
