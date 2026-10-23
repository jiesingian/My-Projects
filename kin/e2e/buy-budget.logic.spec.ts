import { test, expect } from "@playwright/test";
import { budgetSummary, differsFromBook, lineActual, lineBudget, lineSavings, parseAmount } from "@/lib/buy-budget";

/** Budget, actual and savings on the to-buy list (23 October, Janine). */

test("a line's budget is its own, else the price book's estimate", () => {
  expect(lineBudget({ checked: false, budget: 110, estimated: 90, actual: null })).toBe(110);
  expect(lineBudget({ checked: false, budget: null, estimated: 90, actual: null })).toBe(90);
  expect(lineBudget({ checked: false, budget: null, estimated: null, actual: null })).toBeNull();
});

test("a ticked line cost its budget until someone says otherwise; an unticked one cost nothing", () => {
  expect(lineActual({ checked: true, budget: 110, estimated: null, actual: null })).toBe(110);
  expect(lineActual({ checked: true, budget: 110, estimated: null, actual: 104 })).toBe(104);
  expect(lineActual({ checked: false, budget: 110, estimated: null, actual: 104 })).toBeNull();
  expect(lineSavings({ checked: true, budget: 110, estimated: null, actual: 104 })).toBe(6);
  expect(lineSavings({ checked: true, budget: 100, estimated: null, actual: 112.5 })).toBe(-12.5);
  expect(lineSavings({ checked: true, budget: null, estimated: null, actual: 50 })).toBeNull();
});

test("savings count bought lines with a budget only; what is not bought never reads as saved", () => {
  const s = budgetSummary([
    { checked: true, budget: 110, estimated: null, actual: 104 },
    { checked: true, budget: null, estimated: 60, actual: 70 },
    { checked: true, budget: null, estimated: null, actual: 25 },
    { checked: false, budget: 500, estimated: null, actual: null },
    { checked: false, budget: null, estimated: null, actual: null },
  ]);
  expect(s).toEqual({ budget: 670, actual: 199, savings: -4, toBuy: 500, noBudget: 2, bought: 3, lines: 5 });
});

test("amounts: blank and nonsense are none, commas allowed, never negative", () => {
  expect(parseAmount("")).toBeNull();
  expect(parseAmount("abc")).toBeNull();
  expect(parseAmount("-5")).toBeNull();
  expect(parseAmount("1,250.505")).toBe(1250.51);
  expect(parseAmount(0)).toBe(0);
});

test("the price book is asked about only when what was paid differs from it", () => {
  expect(differsFromBook(110, 110)).toBe(false);
  expect(differsFromBook(104, 110)).toBe(true);
  expect(differsFromBook(104, null)).toBe(true);
});
