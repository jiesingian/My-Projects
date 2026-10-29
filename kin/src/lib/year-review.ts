/** A year's money in one page (Jonathan, 29 October): what was spent and
 * where, what came in, what borrowing cost in interest and how much of the
 * loans was paid off, what owning things cost in upkeep and insurance, what
 * went into savings, and how net worth moved. Rule-based, no AI, and the
 * monthly recap's rules (lib/money-recap.ts) -- transfers are not spending,
 * money put into a goal is savings -- and one more: buying or adding to an
 * asset is not spending either, but its own line. Pure, so it can be tested. */

import { GOAL_CATEGORY, TRANSFER_CATEGORY } from "@/lib/wealth";

export type YearTxn = {
  direction: "in" | "out";
  amount: number;
  category: string | null;
  goalId: string | null;
  sourceTable: string | null;
  /** On a loan payment, the part that paid the loan down. */
  principal: number | null;
  capital: boolean;
};

export type YearReview = {
  year: number;
  spent: number;
  income: number;
  categories: { category: string; spent: number }[];
  interest: number;
  paidDown: number;
  upkeep: number;
  /** Buying or adding to an asset: not a living cost, so not in spent. */
  bought: number;
  insurance: number;
  saved: number;
  netWorth: { start: number; end: number; change: number } | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildYearReview(input: { year: number; txns: YearTxn[]; netWorth: { start: number | null; end: number | null } }): YearReview {
  const plain = (t: YearTxn) => !t.goalId && t.category !== TRANSFER_CATEGORY && t.category !== GOAL_CATEGORY;
  const spending = input.txns.filter((t) => t.direction === "out" && plain(t) && !t.capital);
  const by = new Map<string, number>();
  for (const t of spending) by.set(t.category ?? "Other", (by.get(t.category ?? "Other") ?? 0) + t.amount);
  const loanPayments = input.txns.filter((t) => t.direction === "out" && t.sourceTable === "liabilities");
  const { start, end } = input.netWorth;
  return {
    year: input.year,
    spent: round2(spending.reduce((s, t) => s + t.amount, 0)),
    income: round2(input.txns.filter((t) => t.direction === "in" && plain(t)).reduce((s, t) => s + t.amount, 0)),
    categories: [...by.entries()].map(([category, spent]) => ({ category, spent: round2(spent) })).sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category)),
    // A loan payment with no recorded split is left out of interest
    // rather than guessed.
    interest: round2(loanPayments.filter((t) => t.principal != null).reduce((s, t) => s + Math.max(0, t.amount - t.principal!), 0)),
    paidDown: round2(loanPayments.reduce((s, t) => s + (t.principal ?? 0), 0)),
    upkeep: round2(input.txns.filter((t) => t.direction === "out" && t.sourceTable === "assets" && !t.capital).reduce((s, t) => s + t.amount, 0)),
    bought: round2(input.txns.filter((t) => t.direction === "out" && t.capital).reduce((s, t) => s + t.amount, 0)),
    insurance: round2(spending.filter((t) => t.category === "Insurance").reduce((s, t) => s + t.amount, 0)),
    saved: round2(input.txns.filter((t) => t.goalId).reduce((s, t) => s + (t.direction === "out" ? 1 : -1) * t.amount, 0)),
    netWorth: start !== null && end !== null ? { start, end, change: round2(end - start) } : null,
  };
}
