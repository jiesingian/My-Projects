import { test, expect } from "@playwright/test";
import { wealthRows, type FundLike, type IncomeLike, type LoanLike, type PaluwaganLike, type UtangLike } from "@/lib/today-wealth";

/** Wealth on Today (23 October): the rows and the week's Coming up lines,
 * from the same sums the Wealth tab shows. Friday 23 October 2026. */

const today = "2026-10-23";
const none = { utang: [], paluwagans: [], loans: [], funds: [], income: [] };

const utang = (over: Partial<UtangLike>): UtangLike => ({
  id: "u1", direction: "borrowed", personName: "Tita Mel", amount: 8000, paid: 2000, left: 6000, settled: false, dueOn: null, instalments: null, instalmentFrequency: null, firstDueOn: null, ...over,
});

test("an utang's next instalment: due today to pay, money lent to record, next week's in Coming up", () => {
  const { today: rows, soon } = wealthRows(
    {
      ...none,
      utang: [
        utang({ instalments: 4, instalmentFrequency: "monthly", firstDueOn: "2026-09-23" }), // 2 of 4 due today
        utang({ id: "u2", direction: "lent", personName: "Kuya Ben", paid: 0, left: 8000, dueOn: "2026-10-27" }),
        utang({ id: "u3", settled: true, dueOn: "2026-10-23" }),
      ],
    },
    today,
    "PHP",
  );
  expect(rows.map((r) => [r.id, r.title, r.meta, r.action, r.urgent])).toEqual([["utang-u1", "We owe Tita Mel", "₱2,000 · instalment 2 of 4 · due today", "pay", true]]);
  expect(soon.map((r) => [r.id, r.title, r.meta, r.at, r.whose])).toEqual([["soon-utang-u2", "Kuya Ben owes us", "₱8,000 left · due on Tuesday", 4, "family"]]);
});

test("an instalment missed reads overdue, and one part paid says so", () => {
  // 2 of 4 fell on 23 September and only the first is covered.
  const missed = wealthRows({ ...none, utang: [utang({ instalments: 4, instalmentFrequency: "monthly", firstDueOn: "2026-08-23" })] }, today, "PHP");
  expect(missed.today[0].meta).toBe("₱2,000 · instalment 2 of 4 · overdue");
  // 2 of 4 due today, with 2,500 in: the first covered and part of the second.
  const part = wealthRows({ ...none, utang: [utang({ instalments: 4, instalmentFrequency: "monthly", firstDueOn: "2026-09-23", paid: 2500, left: 5500 })] }, today, "PHP");
  expect(part.today[0].meta).toBe("₱2,000 · instalment 2 of 4 · due today · part paid");
});

const group: PaluwaganLike = {
  id: "g1", name: "Ate Joy's", contribution: 1000, frequency: "monthly", startsOn: "2026-08-23",
  members: [{ id: "m1", name: "Joy", turn: 1, isUs: false }, { id: "m2", name: "Us", turn: 2, isUs: true }, { id: "m3", name: "Mel", turn: 3, isUs: false }],
  paid: new Set(["m2:1", "m2:2"]),
};

test("a paluwagan: our hulog for the round that is on until it is in; our turn on its day; next week's round", () => {
  // Round 3 falls today (23 Oct); our hulog for it is not in.
  const r = wealthRows({ ...none, paluwagans: [group] }, today, "PHP");
  expect(r.today.map((x) => [x.id, x.title, x.meta, x.action])).toEqual([["paluwagan-g1", "Contribution · Ate Joy's", "₱1,000 · round 3 of 3 · due today", "pay"]]);
  expect(r.soon).toEqual([]);
  // Our own turn, round 2, on 23 September: the pot, and our hulog in already.
  const ours = wealthRows({ ...none, paluwagans: [group] }, "2026-09-23", "PHP");
  expect(ours.today.map((x) => [x.id, x.meta])).toEqual([["paluwagan-turn-g1", "Our turn · the pot is ₱3,000"]]);
  // A week before round 3: coming up, as a hulog.
  const ahead = wealthRows({ ...none, paluwagans: [group] }, "2026-10-18", "PHP");
  expect(ahead.soon.map((x) => [x.title, x.meta, x.at])).toEqual([["Contribution · Ate Joy's", "₱1,000 on Friday · round 3 of 3", 5]]);
});

test("a loan's payment on its date, a sinking fund on its, income expected today", () => {
  const loans: LoanLike[] = [{ id: "l1", name: "Pag-IBIG", monthly_payment: 5200, next_payment_date: "2026-07-23", payments_remaining: 24 }];
  const funds: FundLike[] = [
    { id: "f1", title: "Tuition", target_amount: 30000, current_amount: 12000, target_date: "2026-10-28", repeats_yearly: false, created_at: "2026-06-01T00:00:00Z" },
    { id: "f2", title: "Insurance", target_amount: 9000, current_amount: 9000, target_date: "2026-10-23", repeats_yearly: true, created_at: "2025-06-01T00:00:00Z" },
  ];
  const income: IncomeLike[] = [{ id: "i1", name: "Salary", amount: 42000, next_date: "2026-10-23", status: "expected" }, { id: "i2", name: "Rent", amount: 15000, next_date: "2026-10-23", status: "received" }];
  const { today: rows, soon } = wealthRows({ ...none, loans, funds, income }, today, "PHP");
  expect(rows.map((r) => [r.id, r.title, r.meta, r.action])).toEqual([
    ["loan-l1", "Pag-IBIG payment", "₱5,200 · due today", "record"],
    ["income-i1", "Salary", "₱42,000 · expected today", "receive"],
  ]);
  expect(soon.map((r) => [r.id, r.meta, r.at])).toEqual([["soon-fund-f1", "₱18,000 to go · due on Wednesday", 5]]);
});

test("the money recap on the first three days of a month, not after", () => {
  expect(wealthRows(none, "2026-11-02", "PHP").today.map((r) => [r.id, r.title, r.href])).toEqual([["recap-2026-10", "Your October 2026 money recap", "/wealth/recap?month=2026-10"]]);
  expect(wealthRows(none, "2026-11-04", "PHP").today).toEqual([]);
});

test("a loan's fixed rate ending within the month is in Coming up; past or further off, not", () => {
  const loan = (rate_fixed_until: string | null): LoanLike => ({ id: "l2", name: "Car loan", monthly_payment: null, next_payment_date: null, payments_remaining: null, rate_fixed_until });
  const soonFor = (until: string | null) => wealthRows({ ...none, loans: [loan(until)] }, today, "PHP").soon.map((r) => [r.id, r.title, r.meta, r.at]);
  expect(soonFor("2026-11-10")).toEqual([["soon-loan-reprice-l2", "Car loan · fixed rate ends", "In 18 days · ask the bank for the new rate, then update it under Payments", 18]]);
  expect(soonFor("2026-10-24")).toEqual([["soon-loan-reprice-l2", "Car loan · fixed rate ends", "Tomorrow · ask the bank for the new rate, then update it under Payments", 1]]);
  expect(soonFor("2026-10-23")).toEqual([["soon-loan-reprice-l2", "Car loan · fixed rate ends", "Today · ask the bank for the new rate, then update it under Payments", 0.5]]);
  expect(soonFor("2026-12-01")).toEqual([]);
  expect(soonFor("2026-10-22")).toEqual([]);
  expect(soonFor(null)).toEqual([]);
});
