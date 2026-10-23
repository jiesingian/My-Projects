import { test, expect } from "@playwright/test";
import { birSummary, buildStatements, type StatementEntry } from "@/lib/statements";

/** The family statements (src/lib/statements.ts): what counts as a cost and
 * what only moves money between cash, debt, assets and goals. */

const e = (o: Partial<StatementEntry> & { direction: string; amount: number }): StatementEntry => ({ category: null, source_table: null, principal_amount: null, capital: false, transfer_group_id: null, ...o });

test("a loan payment's interest is a cost, its principal is not", () => {
  const s = buildStatements([
    e({ direction: "in", amount: 60000, category: "Salary" }),
    e({ direction: "out", amount: 15000, category: "Groceries" }),
    e({ direction: "out", amount: 25000, category: "Debt", source_table: "liabilities", principal_amount: 14166.67 }),
  ]);
  expect(s.incomeTotal).toBe(60000);
  expect(s.livingTotal).toBe(15000);
  expect(s.interest).toBe(10833.33);
  expect(s.surplus).toBe(34166.67);
  expect(s.cash.debtPaid).toBe(14166.67);
  expect(s.cash.borrowing).toBe(-14166.67);
});

test("buying or adding to an asset, saving into a goal and transfers are not living costs", () => {
  const s = buildStatements([
    e({ direction: "out", amount: 120000, category: "Housing", source_table: "assets", capital: true }),
    e({ direction: "out", amount: 3000, category: "Transport", source_table: "assets" }),
    e({ direction: "out", amount: 5000, category: "Goal", source_table: "goals" }),
    e({ direction: "out", amount: 9000, category: "Transfer", transfer_group_id: "t1" }),
    e({ direction: "in", amount: 9000, category: "Transfer", transfer_group_id: "t1" }),
  ]);
  expect(s.living).toEqual([{ category: "Transport", amount: 3000 }]);
  expect(s.cash.bought).toBe(120000);
  expect(s.cash.things).toBe(-120000);
  expect(s.cash.saved).toBe(5000);
  expect(s.incomeTotal).toBe(0);
});

test("selling something and an utang paid back are not income", () => {
  const s = buildStatements([
    e({ direction: "in", amount: 8000, category: "Sold items" }),
    e({ direction: "in", amount: 5000, category: "Utang paid back" }),
    e({ direction: "in", amount: 2000, category: "Investment" }),
  ]);
  expect(s.incomeTotal).toBe(2000);
  expect(s.cash.sold).toBe(8000);
  expect(s.cash.utangBack).toBe(5000);
  expect(s.cash.borrowing).toBe(5000);
});

test("the BIR summary groups income the way the return does, and keeps the rest apart", () => {
  const b = birSummary([
    { category: "Salary", amount: 600000 },
    { category: "Bonus & 13th month", amount: 50000 },
    { category: "House (rent)", amount: 120000 },
    { category: "Remittance", amount: 200000 },
    { category: "Something new", amount: 1000 },
  ]);
  expect(b.groups.find((g) => g.key === "compensation")!.total).toBe(650000);
  expect(b.groups.find((g) => g.key === "rent")!.total).toBe(120000);
  expect(b.groups.find((g) => g.key === "untaxed")!.total).toBe(200000);
  expect(b.otherTotal).toBe(1000);
});
