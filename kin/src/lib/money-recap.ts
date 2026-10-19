/** The monthly money recap: rule-based, no AI. Last month's spending against
 * its budget by category, what changed most from the month before, the
 * bills that fell due and how they went, what was put into savings goals,
 * and how net worth moved.
 *
 * Pure functions, so the rules can be tested without a database. The reading
 * is queries/money-recap.ts, in the viewer's own session: only accounts they
 * can see, with their own private accounts left out if they asked for that
 * on Wealth's All view. Transfers between accounts are not spending; money
 * put into a goal is savings, not spending. */

import { GOAL_CATEGORY, TRANSFER_CATEGORY } from "@/lib/wealth";

export type RecapTxn = {
  /** The household month it happened in, YYYY-MM. */
  month: string;
  direction: "in" | "out";
  amount: number;
  category: string | null;
  goalId: string | null;
};

export type RecapBill = { name: string; amount: number; dueDate: string; status: string; paidDay: string | null };
export type RecapGoal = { id: string; title: string; target: number; current: number };

export type CategoryLine = { category: string; spent: number; budget: number | null; lastMonth: number; over: boolean };
export type Change = { category: string; now: number; before: number; change: number; kind: "up" | "down" | "new" | "gone" };
export type BillLine = RecapBill & { outcome: "on_time" | "late" | "unpaid_late" | "unpaid" };

export type Recap = {
  month: string;
  spent: number;
  spentLastMonth: number;
  income: number;
  budget: number;
  categories: CategoryLine[];
  changes: Change[];
  bills: BillLine[];
  billCounts: { onTime: number; late: number; unpaid: number };
  saved: number;
  goals: (RecapGoal & { putIn: number; pct: number })[];
  netWorth: { end: number; start: number; change: number } | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** YYYY-MM of the month before. */
export function monthBefore(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** The month a recap is for by default: the one before today's. */
export function recapMonthFor(today: string): string {
  return monthBefore(today.slice(0, 7));
}

/** A month the recap may show: a real YYYY-MM, not this month or later. */
export function isRecapMonth(month: string, today: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month < today.slice(0, 7);
}

function isSpending(t: RecapTxn): boolean {
  return t.direction === "out" && !t.goalId && t.category !== TRANSFER_CATEGORY && t.category !== GOAL_CATEGORY;
}

function isIncome(t: RecapTxn): boolean {
  return t.direction === "in" && !t.goalId && t.category !== TRANSFER_CATEGORY && t.category !== GOAL_CATEGORY;
}

function byCategory(txns: RecapTxn[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of txns) if (isSpending(t)) out.set(t.category ?? "Other", (out.get(t.category ?? "Other") ?? 0) + Number(t.amount));
  return out;
}

/** The changes worth a line: at least ₱500 and a fifth of what it was (or
 * new, or gone), the three largest. Small wobbles are not news. */
export function biggestChanges(now: Map<string, number>, before: Map<string, number>, limit = 3): Change[] {
  const cats = new Set([...now.keys(), ...before.keys()]);
  const out: Change[] = [];
  for (const category of cats) {
    const n = round2(now.get(category) ?? 0);
    const b = round2(before.get(category) ?? 0);
    const change = round2(n - b);
    if (Math.abs(change) < 500) continue;
    if (b > 0 && n > 0 && Math.abs(change) < b * 0.2) continue;
    const kind = b === 0 ? "new" : n === 0 ? "gone" : change > 0 ? "up" : "down";
    out.push({ category, now: n, before: b, change, kind });
  }
  return out.sort((x, y) => Math.abs(y.change) - Math.abs(x.change) || x.category.localeCompare(y.category)).slice(0, limit);
}

/** How a bill that fell due in the month went: paid by its date, paid after
 * it, or not paid -- late if its date has passed by `today`. */
export function billOutcome(b: RecapBill, today: string): BillLine["outcome"] {
  const paid = b.status === "paid" || !!b.paidDay;
  if (paid) return b.paidDay && b.paidDay > b.dueDate ? "late" : "on_time";
  return b.dueDate < today ? "unpaid_late" : "unpaid";
}

export function buildRecap(input: {
  month: string;
  today: string;
  txns: RecapTxn[];
  allocations: { category: string; amount: number }[];
  bills: RecapBill[];
  goals: RecapGoal[];
  goalMoves: { goalId: string; month: string; direction: "in" | "out"; amount: number }[];
  netWorth: { end: number | null; start: number | null };
}): Recap {
  const prev = monthBefore(input.month);
  const thisMonth = input.txns.filter((t) => t.month === input.month);
  const lastMonth = input.txns.filter((t) => t.month === prev);
  const now = byCategory(thisMonth);
  const before = byCategory(lastMonth);

  const budgets = new Map<string, number>();
  for (const a of input.allocations) budgets.set(a.category, (budgets.get(a.category) ?? 0) + Number(a.amount));
  const cats = new Set([...now.keys(), ...budgets.keys()]);
  const categories: CategoryLine[] = [...cats]
    .map((category) => {
      const spent = round2(now.get(category) ?? 0);
      const budget = budgets.has(category) ? round2(budgets.get(category)!) : null;
      return { category, spent, budget, lastMonth: round2(before.get(category) ?? 0), over: budget !== null && spent > budget };
    })
    .filter((c) => c.spent > 0 || (c.budget ?? 0) > 0)
    .sort((a, b) => b.spent - a.spent || (b.budget ?? 0) - (a.budget ?? 0) || a.category.localeCompare(b.category));

  const bills = input.bills
    .filter((b) => b.dueDate.slice(0, 7) === input.month)
    .map((b) => ({ ...b, outcome: billOutcome(b, input.today) }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));

  const putIn = new Map<string, number>();
  for (const m of input.goalMoves) {
    if (m.month !== input.month) continue;
    putIn.set(m.goalId, (putIn.get(m.goalId) ?? 0) + (m.direction === "out" ? 1 : -1) * Number(m.amount));
  }
  const goals = input.goals
    .map((g) => ({ ...g, putIn: round2(putIn.get(g.id) ?? 0), pct: g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0 }))
    .sort((a, b) => b.putIn - a.putIn || b.pct - a.pct);

  const { end, start } = input.netWorth;
  return {
    month: input.month,
    spent: round2([...now.values()].reduce((s, n) => s + n, 0)),
    spentLastMonth: round2([...before.values()].reduce((s, n) => s + n, 0)),
    income: round2(thisMonth.filter(isIncome).reduce((s, t) => s + Number(t.amount), 0)),
    budget: round2([...budgets.values()].reduce((s, n) => s + n, 0)),
    categories,
    changes: biggestChanges(now, before),
    bills,
    billCounts: {
      onTime: bills.filter((b) => b.outcome === "on_time").length,
      late: bills.filter((b) => b.outcome === "late").length,
      unpaid: bills.filter((b) => b.outcome === "unpaid" || b.outcome === "unpaid_late").length,
    },
    saved: round2([...putIn.values()].reduce((s, n) => s + n, 0)),
    goals,
    netWorth: end !== null && start !== null ? { end, start, change: round2(end - start) } : null,
  };
}

/** "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" });
}
