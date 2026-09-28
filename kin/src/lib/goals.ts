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
  /** Filled by hand, with a button on the card. */
  logged: boolean;
  /** Can belong to the whole household. */
  household: boolean;
  hint: string;
};

export const GOAL_KIND_META: Record<GoalKind, GoalKindMeta> = {
  money: { label: "Money", icon: "wallet", unit: "₱", defaultPeriod: "total", plus: false, logged: true, household: true, hint: "Fills from a savings goal on Wealth, or from what you put by here." },
  water: { label: "Water", icon: "glassWater", unit: "glasses", defaultPeriod: "day", plus: false, logged: false, household: true, hint: "Fills from the glasses of water logged on Today." },
  steps: { label: "Steps", icon: "activity", unit: "steps", defaultPeriod: "day", plus: true, logged: false, household: true, hint: "Fills from Apple Health." },
  weight: { label: "Weight", icon: "target", unit: "kg", defaultPeriod: "total", plus: true, logged: false, household: false, hint: "From the weight when the goal is set, towards the target. Fills from Apple Health and readings on Family." },
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
