/** Streaks for kids' daily chores (agreed 28 September, item 9): "🔥 7 days in
 * a row", bonus points at 7 and at 30 days, and one "freeze" a week.
 *
 * Computed from routine_log every time, never stored -- the same reason
 * points are summed rather than kept (queries/routines getMemberScores): a
 * stored count would disagree with the log the first time a tick was undone
 * or an approval turned down.
 *
 * THE RULES
 * - A day counts when the chore was marked done and not sent back. One still
 *   waiting for a grown-up counts towards the run on screen; its star waits
 *   for the OK, as points do.
 * - Today not ticked yet never breaks anything: the day is not over.
 * - A missed day (unticked, skipped, or sent back) ends the run -- unless it
 *   is the first miss in that Monday-to-Sunday week, which a freeze covers.
 *   A frozen day keeps the run alive but does not add to it.
 * - Reaching 7 and reaching 30 each earn bonus points (STREAK_BONUS). A
 *   broken run that is built up again earns them again. */

export type DayState = "done" | "pending" | "missed";

export type StreakMilestone = { date: string; reached: 7 | 30 };

export type ChoreStreak = {
  /** Days in the current run. */
  days: number;
  /** Whether this week's freeze has already been spent on this run. */
  freezeUsedThisWeek: boolean;
  /** The run's next bonus star, or null past 30. */
  nextStarAt: 7 | 30 | null;
  /** Every point at which a run reached 7 or 30, oldest first. */
  milestones: StreakMilestone[];
  /** What the household pays for reaching 7 and 30, when the caller knows. */
  bonus?: StreakBonus;
};

const STARS = [7, 30] as const;

export type StreakBonus = Record<7 | 30, number>;

/** Bonus points for reaching a run of 7 and 30 days, until a household sets
 * its own on the Rewards panel. Janine, 7 October: one point each was too
 * small to notice next to 5- and 10-point chores. */
export const STREAK_BONUS: StreakBonus = { 7: 10, 30: 50 };

/** A household's bonus from a given day on (streak_bonus_rates). */
export type StreakBonusRate = { from: string; bonus: StreakBonus };

/** The bonus in force on `iso`: the newest rate from that day or earlier.
 * A change applies to streaks reached from then on, never to ones already
 * earned. `rates` is oldest first. */
export function bonusOn(rates: StreakBonusRate[], iso: string): StreakBonus {
  let found = STREAK_BONUS;
  for (const r of rates) if (r.from <= iso) found = r.bonus;
  return found;
}

/** Monday of the ISO week an ISO date falls in, as an ISO date. */
export function weekOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Walks a daily chore's occurrences oldest first. `occurrences` are ISO
 * dates in ascending order up to and including today; `stateOf` says what
 * happened on each (a date with no log is "missed"). */
export function choreStreak(occurrences: string[], stateOf: (iso: string) => DayState, todayISO: string): ChoreStreak {
  let run = 0;
  const frozen = new Set<string>();
  const milestones: StreakMilestone[] = [];

  for (const iso of occurrences) {
    if (iso > todayISO) break;
    const state = stateOf(iso);
    if (state === "done" || state === "pending") {
      run += 1;
      const hit = STARS.find((n) => n === run);
      if (hit) milestones.push({ date: iso, reached: hit });
      continue;
    }
    // Today, not ticked yet: still open, not a miss.
    if (iso === todayISO) continue;
    if (run > 0 && !frozen.has(weekOf(iso))) {
      frozen.add(weekOf(iso));
      continue;
    }
    run = 0;
  }

  return {
    days: run,
    freezeUsedThisWeek: run > 0 && frozen.has(weekOf(todayISO)),
    nextStarAt: STARS.find((n) => n > run) ?? null,
    milestones,
  };
}

/** "7 days in a row" -- or "1 day", since a run of one is not yet a row. */
export function streakLabel(days: number): string {
  return days === 1 ? "1 day" : `${days} days in a row`;
}
