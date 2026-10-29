import { test, expect } from "@playwright/test";
import { actorsFor, depositProgress, mp2RateStale, payFirst, insuranceGap, payOrInvest, costPerMonth, runningCosts, RUNNING_COST_PRESETS, accountGroup, AL_CASH, AL_INVESTMENTS, amortise, amortisedPayment, assetGroup, cardDueDate, emergencyCover, extraPaymentEffect, loanInsurance, loanInsuranceFund, loanKindFor, loanOriginStatus, netWorthMoves, paymentsLeftForBalance, repricedPayment } from "@/lib/wealth";

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

test("loanOriginStatus: a balance within one payment of the table matches; a repricing under a month counts days (28 October test)", () => {
  const today = "2026-10-26";
  const s = loanOriginStatus(loan, today)!;
  // Off by a whole ₱95k: not a match.
  expect(s.matches).toBe(false);
  // On the table, or a couple of thousand off after "keep the balance": a match.
  expect(loanOriginStatus({ ...loan, balance: s.expectedBalance }, today)!.matches).toBe(true);
  expect(loanOriginStatus({ ...loan, balance: s.expectedBalance + 2_010.21 }, today)!.matches).toBe(true);
  expect(loanOriginStatus({ ...loan, balance: s.expectedBalance + 6_000 }, today)!.matches).toBe(false);
  // Fixed until 2 November, seen on 28 October: 5 days, not "0 months".
  const soon = loanOriginStatus({ ...loan, rate_fixed_until: "2026-11-02" }, "2026-10-28")!;
  expect(soon.fixedMonthsLeft).toBe(0);
  expect(soon.fixedDaysLeft).toBe(5);
});

test("emergencyCover: cash over an average month of spending, against the 3-6 month aim", () => {
  // ₱337,540 over months averaging ₱80,000: 4.2 months, on track.
  expect(emergencyCover(337_540, [0, 0, 70_000, 90_000, 80_000, 80_000])).toEqual({ months: 4.2, average: 80_000, counted: 4, status: "on_track" });
  expect(emergencyCover(100_000, [50_000, 50_000])!.status).toBe("low");
  expect(emergencyCover(900_000, [50_000, 50_000])!.status).toBe("ample");
  // Under two months of spending on record: too soon to say.
  expect(emergencyCover(100_000, [0, 0, 0, 0, 0, 40_000])).toBeNull();
  expect(emergencyCover(-5_000, [10_000, 10_000])!.months).toBe(0);
});

test("extraPaymentEffect: ₱2,000 more a month on ₱1.8M at 6.5% ends years sooner and saves interest", () => {
  const e = extraPaymentEffect(1_800_000, 6.5, 14_911.44, 2_000, "2026-11-15");
  expect(e.base!.months).toBeGreaterThan(190);
  expect(e.faster!.months).toBeLessThan(e.base!.months);
  expect(e.monthsSooner).toBe(e.base!.months - e.faster!.months);
  expect(e.monthsSooner!).toBeGreaterThan(30);
  expect(e.interestSaved!).toBeGreaterThan(200_000);
  expect(e.base!.last > e.faster!.last).toBe(true);
  // Nothing extra: no change. A payment under the interest: never ends.
  expect(extraPaymentEffect(1_800_000, 6.5, 14_911.44, 0, "2026-11-15").monthsSooner).toBe(0);
  const short = extraPaymentEffect(1_800_000, 6.5, 5_000, 2_000, "2026-11-15");
  expect(short.base).toBeNull();
  expect(short.monthsSooner).toBeNull();
});

test("after a repricing the table runs from that day's balance at the new rate, not the original terms", () => {
  const today = "2027-01-20";
  // Repriced on 2 November 2026 at 7.25%, ₱1,797,989.79 owed and 196 left.
  const payment = repricedPayment(1_797_989.79, 7.25, 196);
  expect(payment).toBeGreaterThan(14_911.44);
  const repriced = { ...loan, interest_rate: 7.25, monthly_payment: payment, next_payment_date: "2026-11-15", payments_remaining: 196, repriced_on: "2026-11-02", repriced_balance: 1_797_989.79, repriced_payments_left: 196 };
  const s = loanOriginStatus(repriced, today)!;
  expect(s.from).toBe("repricing");
  expect(s.original).toBe(1_797_989.79);
  expect(s.term).toBe(196);
  // November, December and January paid since.
  expect(s.made).toBe(3);
  // A balance that followed the new table reads as matching.
  expect(loanOriginStatus({ ...repriced, balance: s.expectedBalance }, today)!.matches).toBe(true);
  // Without the repricing, the original terms at the new rate would not agree.
  expect(loanOriginStatus({ ...repriced, repriced_on: null, balance: s.expectedBalance }, today)!.matches).toBe(false);
});

/** A lender's yearly insurance (28 October): a bank mortgage and a car loan
 * need it bought each year; Pag-IBIG has it in the monthly payment. */
test("which loans need yearly insurance, and the fund that pays it", () => {
  const bank = loanInsurance({ name: "BPI housing loan", kind: "mortgage", lender: "BPI" });
  expect(bank?.included).toBe(false);
  expect(bank?.title).toBe("BPI housing loan insurance");
  expect(bank?.what).toMatch(/fire insurance.*MRI/);
  expect(loanInsurance({ name: "Housing loan", kind: "mortgage", lender: "Pag-IBIG Fund" })?.included).toBe(true);
  expect(loanInsurance({ name: "HDMF loan", kind: "mortgage", lender: null })?.included).toBe(true);
  expect(loanInsurance({ name: "Car loan", kind: "auto_loan", lender: "BDO" })?.what).toMatch(/comprehensive car insurance/);
  expect(loanInsurance({ name: "Salary loan", kind: "personal_loan" })).toBeNull();
  expect(loanInsurance({ name: "Visa", kind: "credit_card" })).toBeNull();

  const goals = [
    { title: "Tuition", repeats_yearly: true },
    { title: "BPI housing loan insurance", repeats_yearly: false },
    { title: "Car loan insurance", repeats_yearly: true },
    { title: "BPI Housing Loan MRI", repeats_yearly: true },
  ];
  expect(loanInsuranceFund("Car loan", goals)?.title).toBe("Car loan insurance");
  // A one-off goal is not a yearly fund; the MRI one names the loan.
  expect(loanInsuranceFund("BPI housing loan", goals)?.title).toBe("BPI Housing Loan MRI");
  expect(loanInsuranceFund("Auto loan", goals)).toBeNull();
  // Another loan whose name sits inside the fund's is not its loan.
  expect(loanInsuranceFund("Car loan", [{ title: "BDO car loan insurance", repeats_yearly: true }])).toBeNull();
});

/** An asset's running costs (28 October): repeating bills against it, the
 * newest of each, and what they come to a month. */
test("running costs: newest bill of each name, monthly share of each repeat", () => {
  expect(costPerMonth(28_000, "yearly")).toBe(2333.33);
  expect(costPerMonth(4_500, "monthly")).toBe(4500);
  expect(costPerMonth(3_000, "quarterly")).toBe(1000);
  expect(costPerMonth(500, "once")).toBe(0);
  const r = runningCosts([
    { name: "Association dues", amount: 4500, recurrence: "monthly", due_date: "2026-10-05", status: "paid" },
    { name: "Association dues", amount: 4500, recurrence: "monthly", due_date: "2026-11-05", status: "unpaid" },
    { name: "Real property tax (amilyar)", amount: 12_000, recurrence: "yearly", due_date: "2026-01-31", status: "paid" },
    { name: "Plumber", amount: 2500, recurrence: "once", due_date: "2026-10-01", status: "paid" },
  ]);
  expect(r.costs.map((c) => c.name)).toEqual(["Association dues", "Real property tax (amilyar)"]);
  expect(r.costs[0]).toMatchObject({ open: true, due: "2026-11-05", perMonth: 4500 });
  // Paid and not yet carried forward: still a running cost, no due day.
  expect(r.costs[1]).toMatchObject({ open: false, due: null, perMonth: 1000 });
  expect(r.perMonth).toBe(5500);
  expect(RUNNING_COST_PRESETS.vehicle.map((p) => p.name)).toContain("Car insurance");
});

/** Pay the loan down, or put the money in MP2 (29 October). */
test("payOrInvest holds the loan's rate against MP2's last dividend", () => {
  expect(payOrInvest(9)).toMatchObject({ better: "loan" });
  expect(payOrInvest(6.5)).toMatchObject({ better: "mp2", gap: -0.62 });
  expect(payOrInvest(7.2)).toMatchObject({ better: "even" });
  expect(payOrInvest(null)).toBeNull();
  expect(payOrInvest(0)).toBeNull();
});

/** A car or a house with no insurance among its running costs (29 October). */
test("insuranceGap names what a car or house is missing, and nothing else", () => {
  expect(insuranceGap("vehicle", ["LTO registration"])).toMatch(/CTPL/);
  expect(insuranceGap("vehicle", ["Car insurance"])).toBeNull();
  expect(insuranceGap("vehicle", ["CTPL"])).toBeNull();
  expect(insuranceGap("property", [])).toMatch(/Fire insurance/);
  expect(insuranceGap("property", ["Fire insurance"])).toBeNull();
  expect(insuranceGap("valuable", [])).toBeNull();
});

/** Which debt an extra peso should go to (29 October): the dearest. */
test("payFirst picks the highest rate, a card at the BSP ceiling when its rate is unknown", () => {
  const r = payFirst([
    { name: "Housing loan", balance: 4_200_000, ratePct: 7.5 },
    { name: "Car loan", balance: 310_000, ratePct: 8.5 },
    { name: "BPI Visa", balance: 31_000, ratePct: null, card: true },
  ]);
  expect(r).toEqual({ name: "BPI Visa", rate: 36, assumed: true, next: { name: "Car loan", rate: 8.5 } });
  // Paid off, or one debt alone: nothing to choose between.
  expect(payFirst([{ name: "Car loan", balance: 0, ratePct: 8.5 }, { name: "Housing loan", balance: 1, ratePct: 7 }])).toBeNull();
  expect(payFirst([{ name: "Loan", balance: 5, ratePct: null }, { name: "Other", balance: 5, ratePct: 4 }])).toBeNull();
});

test("mp2RateStale: a year's rate is current until the next is declared, about March", () => {
  // 2025's rate, declared February 2026, holds through March 2027.
  expect(mp2RateStale("2026-10-29")).toBe(false);
  expect(mp2RateStale("2027-03-31")).toBe(false);
  expect(mp2RateStale("2027-04-01")).toBe(true);
  expect(mp2RateStale("2028-01-15")).toBe(true);
});

/** Who a money thing waits on (29 October): not everybody. */
test("actorsFor: the named person, then the account's owner, then the owner, then the grown-ups", () => {
  const grownUps = ["jon", "jan"];
  expect(actorsFor({ named: "jan", accountOwner: "jon" }, grownUps)).toEqual(["jan"]);
  expect(actorsFor({ accountOwner: "jon", accountJoint: false, owner: "jan" }, grownUps)).toEqual(["jon"]);
  expect(actorsFor({ accountOwner: "jon", accountJoint: true, owner: "jan", joint: false }, grownUps)).toEqual(["jan"]);
  expect(actorsFor({ owner: "jan", joint: true }, grownUps)).toEqual(grownUps);
  expect(actorsFor({}, grownUps)).toEqual(grownUps);
  // A child's, or someone gone: the grown-ups.
  expect(actorsFor({ owner: "kid", joint: false }, grownUps)).toEqual(grownUps);
  expect(actorsFor({ accountOwner: "gone", accountJoint: false }, grownUps)).toEqual(grownUps);
});

test("depositProgress: who has put into a shared goal this month, by account or by who recorded it", () => {
  const contributors = [{ memberId: "jon", accountId: "bpi" }, { memberId: "jan", accountId: "gcash" }, { memberId: "pat", accountId: null }];
  // Jan logging Jon's deposit from Jon's account marks Jon, not Jan.
  expect(depositProgress(contributors, [{ accountId: "bpi", recordedBy: "jan" }])).toEqual({ done: ["jon"], waiting: ["jan", "pat"] });
  // From an account no contributor pays from: whoever recorded it.
  expect(depositProgress(contributors, [{ accountId: "joint", recordedBy: "pat" }])).toEqual({ done: ["pat"], waiting: ["jon", "jan"] });
  expect(depositProgress(contributors, [])).toEqual({ done: [], waiting: ["jon", "jan", "pat"] });
});
