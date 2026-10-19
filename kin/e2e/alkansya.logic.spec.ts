import { test, expect } from "@playwright/test";
import { interestOn, jarBalances, nextPayday, paydaysDue, pointsToPesos, splitPesos, splitProblem, withdrawalProblem, DEFAULT_SPLIT } from "@/lib/alkansya";

/** The alkansya's arithmetic, without a browser or a database: how a peso is
 * split across gastos, ipon and bigay (the same way the database splits the
 * baon), what points and interest are worth, which paydays are due, and when
 * money may not come out of a jar. */

test("splitPesos gives ipon and bigay their share to the centavo and gastos the rest", () => {
  expect(splitPesos(100, DEFAULT_SPLIT)).toEqual({ gastos: 70, ipon: 20, bigay: 10 });
  // 33.33 / 33.33 / 33.34 -- the odd centavo lands in gastos, never lost.
  const thirds = splitPesos(100, { gastos: 34, ipon: 33, bigay: 33 });
  expect(thirds).toEqual({ gastos: 34, ipon: 33, bigay: 33 });
  const odd = splitPesos(10.01, { gastos: 50, ipon: 25, bigay: 25 });
  expect(odd.ipon).toBe(2.5);
  expect(odd.bigay).toBe(2.5);
  expect(Math.round((odd.gastos + odd.ipon + odd.bigay) * 100) / 100).toBe(10.01);
});

test("splitProblem wants whole percents that add up to 100", () => {
  expect(splitProblem(DEFAULT_SPLIT)).toBeNull();
  expect(splitProblem({ gastos: 100, ipon: 0, bigay: 0 })).toBeNull();
  expect(splitProblem({ gastos: 60, ipon: 20, bigay: 10 })).toMatch(/add up to 100/);
  expect(splitProblem({ gastos: 70.5, ipon: 19.5, bigay: 10 })).toMatch(/whole percent/);
  expect(splitProblem({ gastos: 110, ipon: -10, bigay: 0 })).toMatch(/whole percent/);
});

test("points and interest are worth what the plan says, to the centavo", () => {
  expect(pointsToPesos(30, 0.5)).toBe(15);
  expect(pointsToPesos(3, 0.33)).toBe(0.99);
  expect(interestOn(250, 2)).toBe(5);
  expect(interestOn(33.34, 1.5)).toBe(0.5);
  expect(interestOn(0, 5)).toBe(0);
  expect(interestOn(100, 0)).toBe(0);
});

test("jarBalances sums the ledger, ignoring a jar it does not know", () => {
  const b = jarBalances([
    { jar: "gastos", amount: 70 },
    { jar: "gastos", amount: "-25.50" },
    { jar: "ipon", amount: 20 },
    { jar: "bigay", amount: 10 },
    { jar: "bigay", amount: -10 },
    { jar: "nowhere", amount: 999 },
  ]);
  expect(b).toEqual({ gastos: 44.5, ipon: 20, bigay: 0, total: 64.5 });
});

test("nextPayday is today when today is the day, else the next one", () => {
  // 19 October 2026 is a Monday.
  expect(nextPayday("2026-10-19", 1)).toBe("2026-10-19");
  expect(nextPayday("2026-10-19", 5)).toBe("2026-10-23");
  expect(nextPayday("2026-10-19", 0)).toBe("2026-10-25");
});

test("paydaysDue lists what the database will pay, at most twelve weeks back", () => {
  expect(paydaysDue("2026-10-18", "2026-10-19", 1)).toEqual(["2026-10-19"]);
  expect(paydaysDue("2026-10-19", "2026-10-19", 1)).toEqual([]);
  expect(paydaysDue("2026-09-28", "2026-10-19", 1)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  expect(paydaysDue("2025-01-01", "2026-10-19", 1)).toHaveLength(13);
});

test("withdrawalProblem keeps giving to bigay and spending out of it", () => {
  expect(withdrawalProblem("spend", "gastos", 20, 50)).toBeNull();
  expect(withdrawalProblem("spend", "ipon", 20, 50)).toBeNull();
  expect(withdrawalProblem("give", "bigay", 10, 10)).toBeNull();
  expect(withdrawalProblem("give", "gastos", 10, 50)).toMatch(/bigay/);
  expect(withdrawalProblem("spend", "bigay", 10, 50)).toMatch(/giving/);
  expect(withdrawalProblem("spend", "gastos", 60, 50)).toMatch(/only has 50\.00/);
  expect(withdrawalProblem("spend", "gastos", 0, 50)).toMatch(/how much/);
});
