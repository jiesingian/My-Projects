import { test, expect } from "@playwright/test";
import { budgetsFor, budgetsInForce, budgetTotal, type SpendingBudgetRow } from "@/lib/budgets";

/** Category budgets (src/lib/budgets.ts): a budget repeats from its month
 * until changed, 0 removes it, and All is everyone's added up. */
const JAN = "m-janine";
const row = (member_id: string | null, category: string, amount: number, from: string): SpendingBudgetRow => ({ member_id, category, amount, from_month: `${from}-01` });
const rows = [
  row(null, "Groceries", 30000, "2026-09"),
  row(null, "Groceries", 32000, "2026-11"),
  row(null, "Dining", 5000, "2026-09"),
  row(null, "Dining", 0, "2026-10"),
  row(JAN, "Groceries", 2000, "2026-10"),
  row(JAN, "Dining", "1500" as unknown as number, "2026-10"),
];

test("a budget repeats into later months until changed", () => {
  expect(budgetsFor(budgetsInForce(rows, "2026-10"), "family").get("Groceries")).toBe(30000);
  expect(budgetsFor(budgetsInForce(rows, "2026-12"), "family").get("Groceries")).toBe(32000);
});

test("a removed budget (0) is none from that month, and stays in the months before", () => {
  expect(budgetsFor(budgetsInForce(rows, "2026-09"), "family").get("Dining")).toBe(5000);
  expect(budgetsFor(budgetsInForce(rows, "2026-10"), "family").has("Dining")).toBe(false);
});

test("a month before any budget has none", () => {
  expect(budgetsInForce(rows, "2026-08").size).toBe(0);
});

test("one person's budgets are theirs alone; All adds Family and everyone per category", () => {
  const oct = budgetsInForce(rows, "2026-10");
  expect([...budgetsFor(oct, JAN)]).toEqual([["Groceries", 2000], ["Dining", 1500]]);
  const all = budgetsFor(oct, "all");
  expect(all.get("Groceries")).toBe(32000);
  expect(all.get("Dining")).toBe(1500);
  expect(budgetTotal(all)).toBe(33500);
});

test("someone with no budgets has none, and a total of nothing", () => {
  expect(budgetTotal(budgetsFor(budgetsInForce(rows, "2026-10"), "m-nobody"))).toBe(0);
});
