import { test, expect } from "@playwright/test";
import { buildYearReview, type YearTxn } from "@/lib/year-review";

const t = (x: Partial<YearTxn> & { amount: number }): YearTxn => ({ direction: "out", category: null, goalId: null, sourceTable: null, principal: null, capital: false, ...x });

/** A year's money (29 October), by the monthly recap's rules. */
test("the year: spending by category, interest and paid-down, upkeep, insurance, savings", () => {
  const r = buildYearReview({
    year: 2026,
    txns: [
      t({ amount: 18_000, category: "Groceries" }),
      t({ amount: 41_500, category: "Debt", sourceTable: "liabilities", principal: 15_250 }),
      t({ amount: 12_500, category: "Debt", sourceTable: "liabilities", principal: null }),
      t({ amount: 3_500, category: "Housing", sourceTable: "assets" }),
      t({ amount: 900_000, category: "Housing", sourceTable: "assets", capital: true }),
      t({ amount: 28_000, category: "Insurance", sourceTable: "assets" }),
      t({ amount: 5_000, category: "Transfer" }),
      t({ amount: 10_000, goalId: "g1" }),
      t({ amount: 2_000, goalId: "g1", direction: "in" }),
      t({ amount: 145_000, direction: "in", category: "Salary" }),
    ],
    netWorth: { start: 4_000_000, end: 4_250_000 },
  });
  expect(r.interest).toBe(26_250);
  expect(r.paidDown).toBe(15_250);
  // Capital is buying, not upkeep.
  expect(r.upkeep).toBe(31_500);
  expect(r.insurance).toBe(28_000);
  expect(r.saved).toBe(8_000);
  expect(r.income).toBe(145_000);
  expect(r.bought).toBe(900_000);
  expect(r.categories[0]).toEqual({ category: "Debt", spent: 54_000 });
  expect(r.spent).toBe(18_000 + 54_000 + 3_500 + 28_000);
  expect(r.netWorth).toEqual({ start: 4_000_000, end: 4_250_000, change: 250_000 });
  expect(buildYearReview({ year: 2026, txns: [], netWorth: { start: null, end: 1 } }).netWorth).toBeNull();
});
