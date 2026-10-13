/** Planner goals: what each kind measures, and the arithmetic of a ring.
 *
 * Pure functions only, so the windows and the weight maths can be reasoned
 * about (and tested) without a database. The reading happens in
 * queries/goals.ts; the rules about who may do what live in the policies of
 * 20260928180000_planner_goals.sql. */

import type { IconName } from "@/components/icons";

export const GOAL_KINDS = ["money", "water", "steps", "weight", "gym", "custom"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_PERIODS = ["day", "week", "month", "total"] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export type GoalKindMeta = {
  label: string;
  icon: IconName;
  /** What the target counts, for the form and the ring's caption. */
  unit: string;
  /** The period a new goal of this kind starts with. */
  defaultPeriod: GoalPeriod;
  /** Reads vitals, which are Kin Plus. */
  plus: boolean;
  /** Filled into the goal's own entries by a button on the card. The other
   * kinds are filled by hand too, but into where Kin already keeps that
   * number: Today's water count, or a reading in Health. */
  logged: boolean;
  /** Can belong to the whole household. */
  household: boolean;
  hint: string;
};

export const GOAL_KIND_META: Record<GoalKind, GoalKindMeta> = {
  money: { label: "Money", icon: "wallet", unit: "₱", defaultPeriod: "total", plus: false, logged: true, household: true, hint: "Fills from a savings goal on Wealth, or from what you put by here." },
  water: { label: "Water", icon: "glassWater", unit: "glasses", defaultPeriod: "day", plus: false, logged: false, household: true, hint: "Add a glass here; the same count as the water on Today." },
  steps: { label: "Steps", icon: "activity", unit: "steps", defaultPeriod: "day", plus: true, logged: false, household: true, hint: "Fills from Apple Health, or log the day's total here." },
  weight: { label: "Weight", icon: "target", unit: "kg", defaultPeriod: "total", plus: true, logged: false, household: false, hint: "From the weight when the goal is set, towards the target. The latest reading counts: Apple Health, Family → Health, or one logged here." },
  gym: { label: "Gym", icon: "check", unit: "sessions", defaultPeriod: "week", plus: false, logged: true, household: true, hint: "Tick a session each time you go." },
  custom: { label: "Anything", icon: "sparkle", unit: "times", defaultPeriod: "total", plus: false, logged: true, household: true, hint: "Anything you can count: books, runs, pages, days without sweets." },
};

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  day: "a day",
  week: "a week",
  month: "a month",
  total: "in all",
};

/** "today", "this week" -- for the caption under a ring. */
export const PERIOD_NOW: Record<GoalPeriod, string> = {
  day: "today",
  week: "this week",
  month: "this month",
  total: "so far",
};

export function isGoalKind(v: string): v is GoalKind {
  return (GOAL_KINDS as readonly string[]).includes(v);
}

export function isGoalPeriod(v: string): v is GoalPeriod {
  return (GOAL_PERIODS as readonly string[]).includes(v);
}

/** The first household date (YYYY-MM-DD) progress is counted from, given
 * today's household date. 'total' counts from the day the goal was made. */
export function windowStart(period: GoalPeriod, today: string, weekStart: 0 | 1, createdDay: string): string {
  if (period === "day") return today;
  if (period === "month") return `${today.slice(0, 7)}-01`;
  if (period === "week") {
    const [y, m, d] = today.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const back = (date.getUTCDay() - weekStart + 7) % 7;
    date.setUTCDate(date.getUTCDate() - back);
    return date.toISOString().slice(0, 10);
  }
  return createdDay;
}

/** A weight goal is a distance, not a sum: from where it started towards the
 * target, whichever way that is. Moving the wrong way reads as zero rather
 * than negative -- the ring is an encouragement, the number beside it is the
 * truth. */
export function weightFraction(start: number | null, current: number | null, target: number): number {
  if (start === null || current === null) return 0;
  const way = target - start;
  if (way === 0) return current === target ? 1 : 0;
  return clamp01((current - start) / way);
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Numbers as a person reads them: no trailing .0, thousands grouped. */
export function goalNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded.toLocaleString("en-PH", { maximumFractionDigits: 1 });
}

/** The terms of a promised reward, disclosed wherever someone enters one --
 * setting a reward, asking for one, and saying yes to one (Jonathan, 28
 * September: "the penalty clause should be disclosed when entering an
 * agreement"). The database holds the same terms (20260929003000). */
export const REWARD_TERMS =
  "A promise is binding: once the goal is reached, the giver has 1 day to give the reward. After that Kin reminds the giver every 5 minutes (09:00–21:00) until the one receiving it confirms they got it. The reward can't be changed or taken back by the giver.";

/** How far back a hand entry may be dated: today and the six days before,
 * for the walk without the watch, or the weigh-in written down yesterday. */
export const LOG_BACK_DAYS = 6;

/** YYYY-MM-DD, n days before the given household date. */
export function daysBefore(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - n));
  return date.toISOString().slice(0, 10);
}

/** A date a hand entry may carry: not in the future, not older than a week. */
export function isLoggableDay(day: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today && day >= daysBefore(today, LOG_BACK_DAYS);
}

/** A day's steps for one person, counted once. Apple Health sends the day's
 * total, and a hand entry is the day's total too ("I walked 9,000 today,
 * the watch was on the charger") -- so the larger of the two is the day,
 * never their sum. Readings are grouped by source first, so a second
 * Shortcut run or a second hand entry for the same day is not double
 * counted either. */
export function stepsForDay(readings: { source: string; value: number }[]): number {
  const bySource = new Map<string, number>();
  for (const r of readings) bySource.set(r.source, Math.max(bySource.get(r.source) ?? 0, r.value));
  return Math.max(0, ...bySource.values());
}

/** The sane bounds of a hand-typed reading. */
export const READING_BOUNDS = {
  steps: { min: 0, max: 200_000 },
  weight: { min: 2, max: 400 },
} as const;

/** The first day of the period before the one starting on `start`. */
export function periodBefore(period: Exclude<GoalPeriod, "total">, start: string): string {
  if (period === "day") return daysBefore(start, 1);
  if (period === "week") return daysBefore(start, 7);
  const [y, m] = start.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
}

/** How many periods in a row were met, counting back from this one -- or
 * from the last one, while this one is still open and unclaimed, so a
 * streak does not read as broken at breakfast. */
export function claimStreak(period: Exclude<GoalPeriod, "total">, currentStart: string, claimed: Set<string>): number {
  let at = claimed.has(currentStart) ? currentStart : periodBefore(period, currentStart);
  let run = 0;
  while (claimed.has(at)) {
    run += 1;
    at = periodBefore(period, at);
  }
  return run;
}

/** The days a daily goal's run of claims reached 7 and 30 days in a row --
 * the household's streak bonus is paid on each (lib/streaks bonusOn), the
 * same as a daily chore's. `days` are counted claims, any order. */
export function streakMilestones(days: string[]): { date: string; reached: 7 | 30 }[] {
  const sorted = [...new Set(days)].sort();
  const out: { date: string; reached: 7 | 30 }[] = [];
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && daysBefore(d, 1) === prev ? run + 1 : 1;
    if (run === 7 || run === 30) out.push({ date: d, reached: run });
    prev = d;
  }
  return out;
}

/** The most a goal can be worth each time it is met. */
export const MAX_GOAL_POINTS = 1000;

/** The viewer's own Apple Health link (apple_health_status), if any. */
export type AppleHealthLink = { lastUsedAt: string | null } | null;

/** Where a goal fills from, in a line for its card (Jonathan, 13 October:
 * "show where it fills from, and offer to connect it if it isn't set up";
 * say plainly which kinds have no app source). `connect` asks the card to
 * link to Settings → Connected. Only the owner's own link is known to the
 * viewer, so another person's goal says whose Apple Health it reads. */
export function goalSource(
  kind: GoalKind,
  opts: { savingsTitle: string | null; mine: boolean; ownerFirst: string | null; appleHealth: AppleHealthLink; now?: Date },
): { text: string; connect: boolean } {
  if (kind === "steps" || kind === "weight") {
    if (!opts.mine) {
      return { text: opts.ownerFirst ? `Fills from ${opts.ownerFirst}’s Apple Health, if connected, and what’s logged here.` : "Fills from each person’s Apple Health, if connected, and what’s logged here.", connect: false };
    }
    if (!opts.appleHealth) return { text: "Apple Health isn’t connected — log it here, or connect it to fill this by itself.", connect: true };
    const last = opts.appleHealth.lastUsedAt;
    return { text: last ? `Fills from Apple Health · last sent ${sinceText(last, opts.now ?? new Date())}.` : "Apple Health is connected · nothing sent yet — run the Shortcut once.", connect: false };
  }
  if (kind === "water") return { text: "No app sends water yet. Add a glass here — it’s the same count as Today.", connect: false };
  if (kind === "money") return { text: opts.savingsTitle ? `Fills from “${opts.savingsTitle}” on Wealth.` : "Fills from what’s put by here. No app source.", connect: false };
  return { text: "No app source — log it here.", connect: false };
}

/** "5 min ago", "2 h ago", "3 days ago". */
export function sinceText(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
