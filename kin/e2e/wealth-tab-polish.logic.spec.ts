import { test, expect } from "@playwright/test";
import { periodOverPeriodChange, cashBalanceTrend, billsDueWithin, expenseCategoryColor, EXPENSE_CATEGORIES } from "@/lib/wealth";

/** The pure math behind the wealth tab's month-over-month badge, cash
 * trend, category colours and upcoming-bills forecast -- checked here
 * without a browser, since none of it depends on a request. */

test("periodOverPeriodChange needs at least two periods", () => {
  expect(periodOverPeriodChange([])).toBeNull();
  expect(periodOverPeriodChange([{ income: 100, expense: 40 }])).toBeNull();
});

test("periodOverPeriodChange compares the last two periods, oldest first", () => {
  const change = periodOverPeriodChange([
    { income: 100, expense: 40 }, // net 60, ignored -- not one of the last two
    { income: 100, expense: 60 }, // net 40, previous
    { income: 120, expense: 50 }, // net 70, current
  ]);
  expect(change).not.toBeNull();
  expect(change!.previousNet).toBe(40);
  expect(change!.currentNet).toBe(70);
  expect(change!.netDelta).toBe(30);
  expect(change!.pctChange).toBeCloseTo(75, 5);
});

test("periodOverPeriodChange reports no percentage when the previous period had no net activity", () => {
  const change = periodOverPeriodChange([
    { income: 50, expense: 50 }, // net 0
    { income: 100, expense: 20 }, // net 80
  ]);
  expect(change!.netDelta).toBe(80);
  expect(change!.pctChange).toBeNull();
});

test("cashBalanceTrend reconstructs backward from the current total", () => {
  const history = [
    { key: "1", label: "JAN", income: 1000, expense: 400 }, // net +600
    { key: "2", label: "FEB", income: 500, expense: 800 }, // net -300
    { key: "3", label: "MAR", income: 200, expense: 100 }, // net +100
  ];
  const trend = cashBalanceTrend(history, 10_000);
  // The current total is the balance at the end of the last period.
  expect(trend[2].balance).toBe(10_000);
  // Working backward: undo March's +100, undo February's -300.
  expect(trend[1].balance).toBe(10_000 - 100);
  expect(trend[0].balance).toBe(10_000 - 100 - -300);
  expect(trend.map((t) => t.key)).toEqual(["1", "2", "3"]);
});

test("cashBalanceTrend with no history is just today's balance, nowhere to reconstruct from", () => {
  expect(cashBalanceTrend([], 500)).toEqual([]);
});

test("billsDueWithin includes what's overdue, not just what's ahead", () => {
  const from = new Date(2026, 8, 10); // 10 September 2026
  const bills = [
    { id: "a", due_date: "2026-09-05", status: "unpaid", amount: 100 }, // overdue
    { id: "b", due_date: "2026-09-20", status: "unpaid", amount: 200 }, // within 30 days
    { id: "c", due_date: "2026-11-01", status: "unpaid", amount: 300 }, // outside the window
    { id: "d", due_date: "2026-09-12", status: "paid", amount: 400 }, // already settled
    { id: "e", due_date: null, status: "unpaid", amount: 500 }, // no deadline to forecast from
  ];
  const { bills: due, total } = billsDueWithin(bills, 30, from);
  expect(due.map((b) => b.id)).toEqual(["a", "b"]);
  expect(total).toBe(300);
});

test("billsDueWithin sorts soonest (or most overdue) first", () => {
  const from = new Date(2026, 8, 10);
  const bills = [
    { id: "later", due_date: "2026-09-25", status: "unpaid", amount: 1 },
    { id: "sooner", due_date: "2026-09-11", status: "unpaid", amount: 1 },
  ];
  const { bills: due } = billsDueWithin(bills, 30, from);
  expect(due.map((b) => b.id)).toEqual(["sooner", "later"]);
});

test("expenseCategoryColor gives every category a colour, and the rarely-used ones share the neutral", () => {
  const colors = new Map<string, string>();
  for (const category of EXPENSE_CATEGORIES) {
    const color = expenseCategoryColor(category);
    expect(color).toMatch(/^var\(--wealth-/);
    colors.set(category, color);
  }
  // Seven categories get their own colour; the rest share --wealth-cat-other.
  const distinct = new Set(colors.values());
  expect(distinct.has("var(--wealth-cat-other)")).toBe(true);
  expect(distinct.size).toBeLessThanOrEqual(8);
});

test("expenseCategoryColor falls back to the neutral for anything it's never seen", () => {
  expect(expenseCategoryColor("Made-up Category")).toBe("var(--wealth-cat-other)");
});
