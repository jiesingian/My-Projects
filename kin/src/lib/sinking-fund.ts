/** Sinking funds: a savings goal for a cost that comes back every year --
 * tuition, car registration, an insurance premium, the Christmas season --
 * and what to set aside each month and each payday to have it in time.
 *
 * Pure functions on household dates (YYYY-MM-DD), so the arithmetic can be
 * tested without a database. A sinking fund is an ordinary savings goal
 * (`goals`) with repeats_yearly set; contributions are the same ledger
 * movements as any goal's. Paydays are kinsenas -- the 15th and the
 * month's last day -- the rhythm most Filipino payrolls keep. */

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m, d];
}

function iso(y: number, m0: number, d: number): string {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
}

function lastDay(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** The same date `years` later; 29 February becomes the 28th in a year
 * without one. */
export function addYears(day: string, years: number): string {
  const [y, m, d] = parts(day);
  return iso(y + years, m - 1, Math.min(d, lastDay(y + years, m - 1)));
}

/** The kinsenas paydays from `from` to `to`, both included: the 15th and
 * the last day of each month. */
export function paydaysBetween(from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  let [y, m] = parts(from);
  m -= 1;
  for (;;) {
    for (const d of [15, lastDay(y, m)]) {
      const day = iso(y, m, d);
      if (day > to) return out;
      if (day >= from) out.push(day);
    }
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }
}

export type FundStatus = "funded" | "on_track" | "behind" | "overdue";

export type FundPlan = {
  /** Still to set aside. */
  left: number;
  /** Paydays from today up to the due date, today's included. */
  paydays: number;
  /** Set aside this much each payday from now... */
  perPayday: number;
  /** ...which is this much a month (two paydays). */
  perMonth: number;
  /** What a steady plan from the cycle's start would have put by today. */
  shouldHave: number;
  status: FundStatus;
};

function peso(n: number): number {
  return Math.ceil(n * 100) / 100;
}

/** The plan for one fund.
 *
 * `cycleStart` is when this round of saving began: the day the goal was made,
 * or for a yearly fund already paid once, the day it was last due. The
 * on-track test counts paydays, not days: by each payday a steady saver has
 * put by that many shares of the target, so a fund does not read as behind
 * between paydays. With no payday left before the due date, what is left is
 * one payday's worth: set it aside now. */
export function fundPlan(input: { target: number; saved: number; due: string; today: string; cycleStart: string }): FundPlan {
  const target = Math.max(0, input.target);
  const saved = Math.max(0, input.saved);
  const left = Math.max(0, peso(target - saved));
  const ahead = paydaysBetween(input.today, input.due).length;
  const perPayday = left === 0 ? 0 : peso(left / Math.max(1, ahead));
  const perMonth = left === 0 ? 0 : peso(Math.min(left, perPayday * 2));

  const start = input.cycleStart <= input.due ? input.cycleStart : input.due;
  const all = paydaysBetween(start, input.due).length;
  const passed = all - ahead;
  const shouldHave = all === 0 ? (input.today >= input.due ? target : 0) : peso((target * Math.max(0, passed)) / all);

  let status: FundStatus;
  if (left === 0) status = "funded";
  else if (input.today > input.due) status = "overdue";
  else status = saved + 0.005 >= shouldHave ? "on_track" : "behind";

  return { left, paydays: ahead, perPayday, perMonth, shouldHave, status };
}

/** Where this round of saving began: last year's due date for a yearly
 * fund that has come round at least once, else the day the goal was made.
 * A yearly fund whose date passes without "Paid it" keeps that date and
 * reads as overdue, rather than moving on with the money unspent. */
export function cycleStart(opts: { createdDay: string; due: string; repeatsYearly: boolean }): string {
  if (!opts.repeatsYearly) return opts.createdDay;
  const lastDue = addYears(opts.due, -1);
  return lastDue > opts.createdDay ? lastDue : opts.createdDay;
}

/** "Paid it" shows from a month before the due date -- tuition and premiums
 * are often paid early -- and stays after it until the payment is recorded. */
export function canMarkPaid(due: string, today: string): boolean {
  const [y, m, d] = parts(today);
  const monthOn = iso(y, m, Math.min(d, lastDay(y, m)));
  return due <= monthOn;
}

/** Common yearly costs, for the add-goal form's quick picks. */
export const SINKING_FUND_PRESETS = [
  { title: "Tuition", note: "School fees for the next school year" },
  { title: "Car registration", note: "LTO renewal and insurance" },
  { title: "Insurance premium", note: "The yearly premium" },
  { title: "Christmas", note: "Noche Buena, gifts, the 13th-month season" },
] as const;

/** The expense category a fund's payment most likely belongs in, from its
 * title; the sheet lets it be changed. */
export function fundCategory(title: string): string {
  const t = title.toLowerCase();
  if (/tuition|school|enrol/.test(t)) return "Education";
  if (/insurance|premium/.test(t)) return "Insurance";
  if (/\bcar\b|registration|\blto\b/.test(t)) return "Transport";
  if (/christmas|pasko|noche|gift|13th/.test(t)) return "Shopping";
  return "Other";
}

export const STATUS_TEXT: Record<FundStatus, string> = {
  funded: "Funded",
  on_track: "On track",
  behind: "Behind",
  overdue: "Due date passed",
};
