import { test, expect } from "@playwright/test";
import { addMonths, nextDate, subscriptionsFrom, yearlyTotal, type RepeatingRow } from "@/lib/subscriptions";
import { paidFromVisibleFilter } from "@/lib/wealth";

/** Subscriptions (src/lib/subscriptions.ts): what repeats, priced by the
 * month and the year, with when it next falls. */
const TODAY = "2026-10-07";
const row = (r: Partial<RepeatingRow> & { name: string }): RepeatingRow => ({
  id: r.name, amount: 100, recurrence: "monthly", date: null, settled: false, category: null, ...r,
});

test("months are added without spilling past the month's end", () => {
  expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
  expect(addMonths("2026-10-07", 12)).toBe("2027-10-07");
});

test("an open charge is next on its own date, a paid one a period on", () => {
  expect(nextDate({ date: "2026-10-20", settled: false }, "monthly", TODAY)).toBe("2026-10-20");
  expect(nextDate({ date: "2026-09-20", settled: false }, "monthly", TODAY)).toBe("2026-09-20");
  expect(nextDate({ date: "2026-10-05", settled: true }, "monthly", TODAY)).toBe("2026-11-05");
  expect(nextDate({ date: "2026-10-20", settled: true }, "monthly", TODAY)).toBe("2026-11-20");
  expect(nextDate({ date: "2026-01-31", settled: true }, "monthly", TODAY)).toBe("2026-10-31");
  expect(nextDate({ date: "2025-03-01", settled: true }, "yearly", TODAY)).toBe("2027-03-01");
  expect(nextDate({ date: null, settled: true }, "quarterly", TODAY)).toBeNull();
});

test("monthly and yearly cost, one-offs left out, the same thing counted once", () => {
  const subs = subscriptionsFrom(
    [
      row({ name: "Netflix", amount: 549, date: "2026-09-12", settled: true }),
      row({ name: "netflix ", id: "n2", amount: 549, date: "2026-10-12" }),
      row({ name: "Insurance", amount: 12_000, recurrence: "yearly", date: "2027-01-15" }),
      row({ name: "Water", amount: 600, recurrence: "quarterly" }),
      row({ name: "Sofa", amount: 30_000, recurrence: "once", date: "2026-10-09" }),
      row({ name: "Old", recurrence: null }),
    ],
    TODAY,
  );
  expect(subs.map((s) => [s.name, s.next])).toEqual([
    ["netflix", "2026-10-12"],
    ["Insurance", "2027-01-15"],
    ["Water", null],
  ]);
  expect(subs[0]).toMatchObject({ id: "n2", monthly: 549, yearly: 6_588, overdue: false });
  expect(subs[1]).toMatchObject({ monthly: 1_000, yearly: 12_000 });
  expect(subs[2]).toMatchObject({ monthly: 200, yearly: 2_400 });
  expect(yearlyTotal(subs)).toBe(6_588 + 12_000 + 2_400);
});

test("an open charge past its date is overdue", () => {
  const [s] = subscriptionsFrom([row({ name: "PLDT", date: "2026-10-01" })], TODAY);
  expect(s).toMatchObject({ next: "2026-10-01", overdue: true });
});

test("bills paid from an account nobody showed you are filtered in the query", () => {
  const a = "a4000000-0000-0000-0000-000000000001";
  expect(paidFromVisibleFilter([])).toBe("paid_from_account_id.is.null");
  expect(paidFromVisibleFilter([a])).toBe(`paid_from_account_id.is.null,paid_from_account_id.in.(${a})`);
  expect(paidFromVisibleFilter([a, "x),name.eq.(y"])).toBe(`paid_from_account_id.is.null,paid_from_account_id.in.(${a})`);
});
