import { test, expect } from "@playwright/test";
import { biggestChanges, billOutcome, buildRecap, isRecapMonth, monthBefore, monthLabel, recapMonthFor, type RecapTxn } from "@/lib/money-recap";

/** The monthly money recap, without a browser or a database: what counts as
 * spending, budgets, the changes worth a line, bills, savings and net worth. */

const t = (month: string, direction: "in" | "out", amount: number, category: string | null, goalId: string | null = null): RecapTxn => ({ month, direction, amount, category, goalId });

test("months: the one before, the default, and which may be shown", () => {
  expect(monthBefore("2026-10")).toBe("2026-09");
  expect(monthBefore("2026-01")).toBe("2025-12");
  expect(recapMonthFor("2026-11-01")).toBe("2026-10");
  expect(isRecapMonth("2026-10", "2026-11-01")).toBe(true);
  expect(isRecapMonth("2026-11", "2026-11-01")).toBe(false);
  expect(isRecapMonth("2026-13", "2027-11-01")).toBe(false);
  expect(isRecapMonth("../x", "2026-11-01")).toBe(false);
  expect(monthLabel("2026-10")).toBe("October 2026");
});

test("transfers and money into goals are not spending; a fund's payment is", () => {
  const r = buildRecap({
    month: "2026-10",
    today: "2026-11-01",
    txns: [
      t("2026-10", "out", 3000, "Groceries"),
      t("2026-10", "out", 5000, "Transfer"),
      t("2026-10", "in", 5000, "Transfer"),
      t("2026-10", "out", 2000, "Goal", "g1"),
      t("2026-10", "in", 20000, "Goal", "g2"),
      t("2026-10", "out", 20000, "Education"),
      t("2026-10", "in", 40000, "Salary"),
    ],
    allocations: [],
    bills: [],
    goals: [],
    goalMoves: [],
    netWorth: { end: null, start: null },
  });
  expect(r.spent).toBe(23000);
  expect(r.income).toBe(40000);
});

test("spent against budget, over flagged, unbudgeted kept, sorted by spend", () => {
  const r = buildRecap({
    month: "2026-10",
    today: "2026-11-01",
    txns: [t("2026-10", "out", 9000, "Groceries"), t("2026-10", "out", 1200, "Dining"), t("2026-10", "out", 300, null)],
    allocations: [
      { category: "Groceries", amount: 8000 },
      { category: "Utilities", amount: 4000 },
    ],
    bills: [],
    goals: [],
    goalMoves: [],
    netWorth: { end: null, start: null },
  });
  expect(r.budget).toBe(12000);
  expect(r.categories.map((c) => [c.category, c.spent, c.budget, c.over])).toEqual([
    ["Groceries", 9000, 8000, true],
    ["Dining", 1200, null, false],
    ["Other", 300, null, false],
    ["Utilities", 0, 4000, false],
  ]);
});

test("biggest changes: at least ₱500 and a fifth, new and gone, three at most", () => {
  const now = new Map([["Groceries", 10000], ["Dining", 3000], ["Transport", 2100], ["Health", 1500], ["Shopping", 600]]);
  const before = new Map([["Groceries", 9000], ["Dining", 1000], ["Transport", 2000], ["Travel", 5000], ["Shopping", 0]]);
  const c = biggestChanges(now, before);
  // Groceries +1,000 is under a fifth of 9,000; Transport +100 is under ₱500.
  expect(c.map((x) => [x.category, x.kind, x.change])).toEqual([
    ["Travel", "gone", -5000],
    ["Dining", "up", 2000],
    ["Health", "new", 1500],
  ]);
});

test("bills: on time, late, not paid and still due", () => {
  const base = { name: "Meralco", amount: 3000, dueDate: "2026-10-15" };
  expect(billOutcome({ ...base, status: "paid", paidDay: "2026-10-14" }, "2026-11-01")).toBe("on_time");
  expect(billOutcome({ ...base, status: "paid", paidDay: "2026-10-15" }, "2026-11-01")).toBe("on_time");
  expect(billOutcome({ ...base, status: "paid", paidDay: "2026-10-20" }, "2026-11-01")).toBe("late");
  expect(billOutcome({ ...base, status: "unpaid", paidDay: null }, "2026-11-01")).toBe("unpaid_late");
  expect(billOutcome({ ...base, dueDate: "2026-10-31", status: "unpaid", paidDay: null }, "2026-10-31")).toBe("unpaid");
  const r = buildRecap({
    month: "2026-10",
    today: "2026-11-01",
    txns: [],
    allocations: [],
    bills: [
      { ...base, status: "paid", paidDay: "2026-10-14" },
      { name: "Water", amount: 500, dueDate: "2026-10-05", status: "unpaid", paidDay: null },
      { name: "Next month", amount: 1, dueDate: "2026-11-05", status: "unpaid", paidDay: null },
    ],
    goals: [],
    goalMoves: [],
    netWorth: { end: null, start: null },
  });
  expect(r.bills.map((b) => b.name)).toEqual(["Water", "Meralco"]);
  expect(r.billCounts).toEqual({ onTime: 1, late: 0, unpaid: 1 });
});

test("savings: what went into each goal that month, net of money taken back out", () => {
  const r = buildRecap({
    month: "2026-10",
    today: "2026-11-01",
    txns: [],
    allocations: [],
    bills: [],
    goals: [
      { id: "g1", title: "Tuition", target: 60000, current: 12000 },
      { id: "g2", title: "Christmas", target: 20000, current: 25000 },
    ],
    goalMoves: [
      { goalId: "g1", month: "2026-10", direction: "out", amount: 4000 },
      { goalId: "g1", month: "2026-10", direction: "out", amount: 4000 },
      { goalId: "g1", month: "2026-09", direction: "out", amount: 4000 },
      { goalId: "g2", month: "2026-10", direction: "in", amount: 1000 },
    ],
    netWorth: { end: 510000, start: 500000 },
  });
  expect(r.saved).toBe(7000);
  expect(r.goals.map((g) => [g.title, g.putIn, g.pct])).toEqual([
    ["Tuition", 8000, 20],
    ["Christmas", -1000, 100],
  ]);
  expect(r.netWorth).toEqual({ end: 510000, start: 500000, change: 10000 });
});

test("net worth needs both months' snapshots", () => {
  const r = buildRecap({ month: "2026-10", today: "2026-11-01", txns: [], allocations: [], bills: [], goals: [], goalMoves: [], netWorth: { end: 1, start: null } });
  expect(r.netWorth).toBeNull();
});
