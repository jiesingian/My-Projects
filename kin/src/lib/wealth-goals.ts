import { amortise } from "@/lib/wealth";

/** 🎯 "Make it a goal" on Wealth (Jonathan, 29 October): what a Planner
 * money goal can follow on Wealth (planner_goals.tracks, 20261029234000),
 * and how each one fills. Pure, so the rules have a test of their own. */
export const TRACKS = ["account", "loan", "income", "expense", "asset"] as const;
export type Tracks = (typeof TRACKS)[number];
export const isTracks = (v: string | null | undefined): v is Tracks => !!v && (TRACKS as readonly string[]).includes(v);

/** The key a Wealth entry and its goal meet on: "account:<id>",
 * "expense:<owner|family>:<category>". */
export function trackKey(tracks: Tracks, idOrCategory: string, owner: string | null = null): string {
  return tracks === "expense" ? `expense:${owner ?? "family"}:${idOrCategory}` : `${tracks}:${idOrCategory}`;
}

/** An auto-save loan bill's name begins so: "Extra on Car loan". */
export const EXTRA_PREFIX = "Extra on ";

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** A savings account up to a balance. */
export function accountProgress(balance: number, target: number) {
  return { current: Math.max(0, balance), fraction: clamp01(balance / target), reached: balance >= target };
}

/** A loan paid down to `owe` by its date: the goal's target is how much to
 * pay down from where it stood (`start`); paid so far is start - balance. */
export function loanProgress(start: number, balance: number, owe: number) {
  const toPay = Math.max(0, start - owe);
  const paid = Math.max(0, start - balance);
  return { current: paid, target: toPay, fraction: toPay > 0 ? clamp01(paid / toPay) : 1, reached: balance <= owe + 0.005 };
}

/** Whether the regular payment gets a loan to `owe` within `months`, and if
 * not, the extra a month that does (to the next peso up). A payment that
 * can't get there at any extra under the balance itself: extra null. */
export function loanPace(balance: number, ratePct: number | null, payment: number, owe: number, months: number): { onTrack: boolean; extra: number | null } {
  const n = Math.max(0, Math.floor(months));
  const after = (pay: number) => amortise(balance, ratePct, pay, n).balance;
  if (balance <= owe + 0.005) return { onTrack: true, extra: 0 };
  if (n === 0) return { onTrack: false, extra: null };
  if (after(payment) <= owe + 0.005) return { onTrack: true, extra: 0 };
  let lo = 0;
  let hi = balance;
  if (after(payment + hi) > owe + 0.005) return { onTrack: false, extra: null };
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (after(payment + mid) <= owe + 0.005) hi = mid;
    else lo = mid;
  }
  return { onTrack: false, extra: Math.ceil(hi) };
}

/** A spending category's monthly limit: spent against it, and what is left.
 * Under it is the good side, so it is never "reached" while the month runs;
 * `over` is how far past it. */
export function limitProgress(spent: number, limit: number) {
  return { current: Math.max(0, spent), fraction: clamp01(spent / limit), left: Math.max(0, limit - spent), over: Math.max(0, spent - limit) };
}

export type Occurrence = { expected: string; amount: number; receivedOn: string | null; received: number | null };

/** A regular income's run of payments that came on their day and in full,
 * newest first: one still open past its day ends the run, and so does one
 * that came late or short. `late` names the newest one that broke it. */
export function onTimeRun(occurrences: Occurrence[], today: string): { run: number; late: { expected: string; why: "late" | "short" | "missing" } | null } {
  const due = occurrences.filter((o) => o.expected <= today).sort((a, b) => (a.expected < b.expected ? 1 : -1));
  let run = 0;
  for (const o of due) {
    if (!o.receivedOn) {
      // Today's not in yet is not late yet.
      if (o.expected === today) continue;
      return { run, late: { expected: o.expected, why: "missing" } };
    }
    if (o.receivedOn.slice(0, 10) > o.expected) return { run, late: { expected: o.expected, why: "late" } };
    if ((o.received ?? 0) + 0.005 < o.amount) return { run, late: { expected: o.expected, why: "short" } };
    run += 1;
  }
  return { run, late: null };
}

/** Whole months from `today` to `date` (YYYY-MM-DD), not below zero. */
export function monthsUntil(today: string, date: string): number {
  const [y1, m1, d1] = today.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = date.slice(0, 10).split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/** The highest of 25, 50, 75 and 100 a goal has passed. */
export function milestoneOf(fraction: number, reached: boolean): 0 | 25 | 50 | 75 | 100 {
  if (reached) return 100;
  return (Math.min(3, Math.floor(Math.max(0, fraction) * 4)) * 25) as 0 | 25 | 50 | 75;
}
