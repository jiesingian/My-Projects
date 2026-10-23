/** A line's budget, what it really cost, and what was saved (23 October,
 * Janine). The budget is the one typed for the line, or else the price book's
 * estimate; a ticked line cost its budget until someone says otherwise. */
export type BudgetLine = { checked: boolean; budget: number | null; estimated: number | null; actual: number | null };

export function lineBudget(l: BudgetLine): number | null {
  return l.budget ?? l.estimated ?? null;
}

/** What a ticked line cost; nothing for a line still to buy. */
export function lineActual(l: BudgetLine): number | null {
  return l.checked ? (l.actual ?? lineBudget(l)) : null;
}

/** Saved on a ticked line: its budget less what it cost, negative when over.
 * Null when there is no budget to measure against. */
export function lineSavings(l: BudgetLine): number | null {
  const budget = lineBudget(l);
  const actual = lineActual(l);
  return budget == null || actual == null ? null : round(budget - actual);
}

export type BudgetSummary = {
  /** Every line's budget, ticked or not. */
  budget: number;
  /** What the ticked lines cost. */
  actual: number;
  /** Budget less actual, over ticked lines that had a budget only -- so what
   * is not bought yet never reads as saved. */
  savings: number;
  /** The budget of what is still to buy. */
  toBuy: number;
  /** Lines with no budget at all, so the totals can say they leave them out. */
  noBudget: number;
  bought: number;
  lines: number;
};

export function budgetSummary(lines: BudgetLine[]): BudgetSummary {
  let budget = 0, actual = 0, savings = 0, toBuy = 0, noBudget = 0, bought = 0;
  for (const l of lines) {
    const b = lineBudget(l);
    if (b == null) noBudget++;
    else budget += b;
    if (l.checked) {
      bought++;
      actual += lineActual(l) ?? 0;
      savings += lineSavings(l) ?? 0;
    } else if (b != null) toBuy += b;
  }
  return { budget: round(budget), actual: round(actual), savings: round(savings), toBuy: round(toBuy), noBudget, bought, lines: lines.length };
}

/** A typed amount: a number of at least zero with at most two decimals, or
 * null for blank or nonsense. */
export function parseAmount(value: unknown): number | null {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? round(n) : null;
}

/** Does what was paid differ from the price book's figure, by a centavo or
 * more? Then Kin asks whether to update the book. */
export function differsFromBook(actual: number, estimated: number | null): boolean {
  return estimated == null || Math.abs(actual - estimated) >= 0.01;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
