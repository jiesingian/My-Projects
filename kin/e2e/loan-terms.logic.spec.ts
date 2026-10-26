import { test, expect } from "@playwright/test";
import { accountGroup, AL_CASH, AL_INVESTMENTS, amortise, amortisedPayment, assetGroup, cardDueDate, loanKindFor, loanOriginStatus, netWorthMoves, paymentsLeftForBalance } from "@/lib/wealth";

/** What A&L groups together (26 October): a balance sheet's groups, not the
 * account types. A time deposit is an investment, a card is not cash. */
test("accounts fall into cash or investments; assets into their balance-sheet group", () => {
  expect(accountGroup("bank")).toBe(AL_CASH);
  expect(accountGroup("ewallet")).toBe(AL_CASH);
  expect(accountGroup("cash")).toBe(AL_CASH);
  expect(accountGroup("investment")).toBe(AL_INVESTMENTS);
  expect(accountGroup("stocks")).toBe(AL_INVESTMENTS);
  expect(assetGroup("investment")).toBe(AL_INVESTMENTS);
  expect(assetGroup("property")).toBe("Property");
  expect(assetGroup("vehicle")).toBe("Vehicles");
  expect(assetGroup("made-up")).toBe("Other");
  expect(loanKindFor("property")).toBe("mortgage");
  expect(loanKindFor("vehicle")).toBe("auto_loan");
  expect(loanKindFor("valuable")).toBe("personal_loan");
});

/** A ₱2,000,000 housing loan at 6.5% over 20 years: the bank's table says
 * ₱14,911 a month, and the first payment is mostly interest. */
test("amortisedPayment is the bank's level payment", () => {
  expect(amortisedPayment(2_000_000, 6.5, 240)).toBeCloseTo(14_911.44, 0);
  expect(amortisedPayment(120_000, 0, 12)).toBe(10_000);
  expect(amortisedPayment(100_000, 12, 1)).toBeCloseTo(101_000, 0);
});

test("amortise runs the loan month by month: interest on what is owed, the rest pays it down", () => {
  const first = amortise(2_000_000, 6.5, 14_911.44, 1);
  expect(first.interest).toBeCloseTo(10_833.33, 1);
  expect(first.principalPaid).toBeCloseTo(4_078.11, 1);
  expect(first.balance).toBeCloseTo(1_995_921.89, 1);
  // The whole term clears it, give or take the rounding of each month's
  // centavos over twenty years (the bank's last payment absorbs it).
  const whole = amortise(2_000_000, 6.5, 14_911.44, 240);
  expect(whole.balance).toBeLessThan(20);
  expect(whole.months).toBe(240);
  expect(whole.interest).toBeCloseTo(1_578_745, -3);
  // No interest: straight down. Paid off early: stops when nothing is owed.
  expect(amortise(120_000, 0, 10_000, 12)).toEqual({ balance: 0, interest: 0, principalPaid: 120_000, months: 12 });
  expect(amortise(30_000, 0, 10_000, 12).months).toBe(3);
  // A payment under the interest pays nothing down; the balance grows.
  const under = amortise(1_000_000, 12, 5_000, 1);
  expect(under.principalPaid).toBe(0);
  expect(under.balance).toBe(1_005_000);
});

const loan = {
  balance: 1_800_000,
  interest_rate: 6.5,
  monthly_payment: 14_911.44,
  original_amount: 2_000_000,
  term_months: 240,
  // Entered on 26 October 2026 with 216 payments left: 24 made.
  next_payment_date: "2026-11-15",
  payments_remaining: 216,
  rate_fixed_until: "2027-10-15",
};

test("loanOriginStatus counts payments made from the dates that have passed and says what should be owed", () => {
  const s = loanOriginStatus(loan, "2026-10-26")!;
  expect(s.made).toBe(24);
  expect(s.left).toBe(216);
  expect(s.payment).toBeCloseTo(14_911.44, 2);
  // Two years in, about ₱1.9M is still owed on ₱2M: most of it was interest.
  expect(s.expectedBalance).toBeCloseTo(1_895_779.44, 1);
  expect(s.interestPaid).toBeCloseTo(253_654, 0);
  expect(s.principalPaid).toBeCloseTo(104_220.56, 1);
  expect(s.principalPaid + s.expectedBalance).toBeCloseTo(2_000_000, 0);
  // The balance on record is lower than the terms say: ₱95k less.
  expect(s.gap).toBeCloseTo(1_800_000 - s.expectedBalance, 2);
  expect(s.gap).toBeLessThan(0);
  expect(s.totalInterest).toBeCloseTo(1_578_745, -3);
  expect(s.fixedMonthsLeft).toBe(12);
});

test("loanOriginStatus moves with the calendar, and ends with the fixed rate", () => {
  // Three months on, three more payments have passed.
  const later = loanOriginStatus(loan, "2027-02-01")!;
  expect(later.made).toBe(27);
  expect(later.left).toBe(213);
  expect(later.expectedBalance).toBeLessThan(loanOriginStatus(loan, "2026-10-26")!.expectedBalance);
  // The fixed rate ended a year ago: months left reads negative.
  expect(loanOriginStatus(loan, "2028-10-15")!.fixedMonthsLeft).toBe(-12);
  expect(loanOriginStatus({ ...loan, rate_fixed_until: null }, "2026-10-26")!.fixedMonthsLeft).toBeNull();
});

test("loanOriginStatus needs the terms; without a typed payment it uses the bank's", () => {
  expect(loanOriginStatus({ ...loan, original_amount: null }, "2026-10-26")).toBeNull();
  expect(loanOriginStatus({ ...loan, term_months: null }, "2026-10-26")).toBeNull();
  const implied = loanOriginStatus({ ...loan, monthly_payment: null }, "2026-10-26")!;
  expect(implied.payment).toBeCloseTo(14_911.44, 0);
  // No schedule dates: nothing has been paid yet, the balance should be the whole amount.
  const fresh = loanOriginStatus({ ...loan, next_payment_date: null, payments_remaining: null, balance: 2_000_000 }, "2026-10-26")!;
  expect(fresh.made).toBe(0);
  expect(fresh.expectedBalance).toBe(2_000_000);
  expect(fresh.gap).toBe(0);
});

test("paymentsLeftForBalance reads the schedule off the balance: the other way to close the gap", () => {
  // ₱1.8M owed on the ₱2M loan: the table reaches that after about 46
  // payments, so about 194 are left -- not the 216 on the schedule.
  const left = paymentsLeftForBalance(loan, 1_800_000)!;
  expect(left).toBeLessThan(216);
  expect(left).toBeGreaterThan(180);
  // The balance the terms give for 24 payments made says 216 left exactly.
  expect(paymentsLeftForBalance(loan, loanOriginStatus(loan, "2026-10-26")!.expectedBalance)).toBe(216);
  // Nothing paid: the whole term. Paid off: none. No terms: nothing to read.
  expect(paymentsLeftForBalance(loan, 2_000_000)).toBe(240);
  expect(paymentsLeftForBalance(loan, 0)).toBe(0);
  expect(paymentsLeftForBalance({ ...loan, term_months: null }, 1_800_000)).toBeNull();
});

test("netWorthMoves: each part as it moved net worth, more owed a fall, largest first, adding up", () => {
  const sep = { cash: 300_000, goals: 50_000, assets: 2_000_000, liabilities: 1_500_000 };
  const oct = { cash: 290_000, goals: 60_000, assets: 2_100_000, liabilities: 1_490_000 };
  const moves = netWorthMoves(sep, oct);
  expect(moves).toEqual([
    { label: "what you own", delta: 100_000 },
    { label: "accounts", delta: -10_000 },
    { label: "set aside for goals", delta: 10_000 },
    { label: "what you owe", delta: 10_000 },
  ]);
  const worth = (p: typeof sep) => p.cash + p.goals + p.assets - p.liabilities;
  expect(moves.reduce((t, m) => t + m.delta, 0)).toBe(worth(oct) - worth(sep));
  expect(netWorthMoves(sep, { ...sep, cash: sep.cash + 0.4 })).toEqual([]);
});

test("cardDueDate: this month's day if still ahead, else next month's; a 31st on a short month's last day", () => {
  expect(cardDueDate(28, "2026-10-26")).toBe("2026-10-28");
  expect(cardDueDate(26, "2026-10-26")).toBe("2026-10-26");
  expect(cardDueDate(15, "2026-10-26")).toBe("2026-11-15");
  expect(cardDueDate(31, "2026-11-05")).toBe("2026-11-30");
  expect(cardDueDate(31, "2027-02-01")).toBe("2027-02-28");
  expect(cardDueDate(5, "2026-12-20")).toBe("2027-01-05");
});
