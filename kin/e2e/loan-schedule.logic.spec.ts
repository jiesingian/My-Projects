import { test, expect } from "@playwright/test";
import { loanPaymentDates, loanStatus } from "@/lib/wealth";

/** A loan's payments on the calendar (12 October): monthly from the next
 * payment entered, as many as were left then, counted down by the dates. */
test("payments fall monthly from the next one, that many of them", () => {
  expect(loanPaymentDates({ next_payment_date: "2026-11-15", payments_remaining: 3 })).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
  expect(loanPaymentDates({ next_payment_date: null, payments_remaining: 3 })).toEqual([]);
  expect(loanPaymentDates({ next_payment_date: "2026-11-15", payments_remaining: null })).toEqual([]);
});

test("a 31st stays the 31st where the month has one", () => {
  expect(loanPaymentDates({ next_payment_date: "2027-01-31", payments_remaining: 3 })).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
});

test("payments left count down by themselves as the dates pass", () => {
  const loan = { next_payment_date: "2026-11-15", payments_remaining: 3 };
  expect(loanStatus(loan, "2026-10-12")).toEqual({ next: "2026-11-15", left: 3, last: "2027-01-15" });
  expect(loanStatus(loan, "2026-11-15")).toEqual({ next: "2026-11-15", left: 3, last: "2027-01-15" });
  expect(loanStatus(loan, "2026-11-16")).toEqual({ next: "2026-12-15", left: 2, last: "2027-01-15" });
  expect(loanStatus(loan, "2027-02-01")).toEqual({ next: null, left: 0, last: "2027-01-15" });
});
