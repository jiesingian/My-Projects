import { test, expect } from "@playwright/test";
import { loanPaymentSplit } from "@/lib/wealth";

/** A loan payment, split the way a bank's amortisation table splits it
 * (20261023220000): this month's interest on what is still owed is the cost,
 * the rest pays the loan down. */

test("interest is the balance times the yearly rate over twelve; the rest pays the loan down", () => {
  // ₱2M Pag-IBIG housing loan at 6.5%, paying ₱25,000.
  expect(loanPaymentSplit(2_000_000, 6.5, 25_000)).toEqual({ interest: 10_833.33, principal: 14_166.67 });
});

test("a payment smaller than the interest pays nothing down", () => {
  expect(loanPaymentSplit(2_000_000, 6.5, 8_000)).toEqual({ interest: 8_000, principal: 0 });
});

test("the last payment never pays down more than is owed; the excess reads as interest", () => {
  expect(loanPaymentSplit(10_000, 12, 15_000)).toEqual({ interest: 5_000, principal: 10_000 });
});

test("no rate saved: all of it pays the loan down", () => {
  expect(loanPaymentSplit(50_000, null, 5_000)).toEqual({ interest: 0, principal: 5_000 });
  expect(loanPaymentSplit(50_000, 0, 5_000)).toEqual({ interest: 0, principal: 5_000 });
});
