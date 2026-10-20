/** Goals and Rewards as a game (Janine, 20 October): the rules, as pure
 * functions.
 *
 * The database is what actually pays: 20261020120000_goals_game.sql closes
 * each household's day (close_game_day) and writes streaks, bonuses and
 * badges. These are the same rules in TypeScript, for the screens (a level
 * bar, "finish your dailies for +20 XP") and so they can be tested without a
 * database. Change one, change the other. */

export const GAME_CATEGORIES = ["water", "move", "food", "sleep", "hygiene", "family"] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];

export const GAME_CATEGORY_META: Record<GameCategory, { label: string; emoji: string }> = {
  water: { label: "Water", emoji: "💧" },
  move: { label: "Move", emoji: "🏃" },
  food: { label: "Food", emoji: "🥦" },
  sleep: { label: "Sleep", emoji: "😴" },
  hygiene: { label: "Hygiene", emoji: "🪥" },
  family: { label: "Family", emoji: "🏡" },
};

export function isGameCategory(v: string): v is GameCategory {
  return (GAME_CATEGORIES as readonly string[]).includes(v);
}

/** What the end of a day pays, once (the database's numbers). */
export const BONUSES = {
  allDailiesDone: { xp: 20, coins: 10 },
  wholeFamilyDone: { xp: 30, coins: 15 },
} as const;

export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

export const DEFAULT_GOAL_XP = 10;
export const DEFAULT_GOAL_COINS = 5;
export const MAX_GOAL_XP = 1000;

/** Level 1 from 0 XP; level 2 at 100; each level after needs 50 more than
 * the one before (3 at 250, 4 at 450, 5 at 700 ...). `into` and `needed`
 * draw the bar: how far into this level, out of how much. */
export function levelFromXp(xp: number): { level: number; into: number; needed: number; nextAt: number } {
  let level = 1;
  let needed = 100;
  let total = 0;
  const x = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  while (x >= total + needed) {
    total += needed;
    level += 1;
    needed += 50;
  }
  return { level, into: x - total, needed, nextAt: total + needed };
}

/** XP, summed from history and never stored: what each counted claim was
 * worth, and each bonus. A claim still waiting for a grown-up is not XP yet,
 * and a refused one never is. */
export function xpTotal(claims: { xp: number; status: string }[], awards: { xp: number }[]): number {
  let sum = 0;
  for (const c of claims) if (c.status === "counted") sum += c.xp;
  for (const a of awards) sum += a.xp;
  return sum;
}

/** Is every one of a player's dailies done? `met` holds the daily goals with
 * a claim that was not refused. With no dailies, there is nothing to finish. */
export function allDailiesDone(dailyIds: string[], met: Set<string>): boolean {
  return dailyIds.length > 0 && dailyIds.every((id) => met.has(id));
}

/** The whole family finished: two players or more, and every one done. */
export function wholeFamilyDone(players: { done: boolean }[]): boolean {
  return players.length >= 2 && players.every((p) => p.done);
}

export type StreakState = { streak: number; best: number; freezes: number };

/** One player's day closing. All done: one more day. Not done: a freeze, if
 * there is one and a streak worth keeping, keeps it; otherwise back to 0. At
 * the end of a Sunday the freeze is refilled for the new week. `day` is the
 * day being closed, YYYY-MM-DD. */
export function closeDay(state: StreakState, done: boolean, day: string): StreakState & { freezeUsed: boolean } {
  let { streak, best, freezes } = state;
  let freezeUsed = false;
  if (done) {
    streak += 1;
    best = Math.max(best, streak);
  } else if (freezes > 0 && streak > 0) {
    freezes -= 1;
    freezeUsed = true;
  } else {
    streak = 0;
  }
  if (isSunday(day)) freezes = 1;
  return { streak, best, freezes, freezeUsed };
}

function isSunday(day: string): boolean {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

export type BadgeRule = { id: string; rule: "streak" | "total_completions" | "level" | "family_streak"; category: string | null; threshold: number };

/** The badges a player's numbers now earn -- the same test the nightly job
 * makes. `completions` counts counted claims per category. */
export function earnedBadges(
  rules: BadgeRule[],
  stats: { bestStreak: number; xp: number; familyBest: number; completions: Partial<Record<string, number>> },
): string[] {
  const total = Object.values(stats.completions).reduce<number>((a, b) => a + (b ?? 0), 0);
  return rules
    .filter((b) => {
      switch (b.rule) {
        case "streak":
          return stats.bestStreak >= b.threshold;
        case "family_streak":
          return stats.familyBest >= b.threshold;
        case "level":
          return levelFromXp(stats.xp).level >= b.threshold;
        case "total_completions":
          return (b.category ? (stats.completions[b.category] ?? 0) : total) >= b.threshold;
      }
    })
    .map((b) => b.id);
}

/** The next streak milestone ahead, for "3 more days to 🔥 7". */
export function nextMilestone(streak: number): number | null {
  return STREAK_MILESTONES.find((m) => m > streak) ?? null;
}
