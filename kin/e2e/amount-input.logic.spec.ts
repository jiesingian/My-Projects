import { test, expect } from "@playwright/test";
import { groupAmountInput, finishAmountInput, amountValue, amountDisplay, caretAfterReformat } from "@/lib/amount-input";
import { formatAccounting } from "@/lib/format";

/** The event budget field reads as an accounting figure -- commas grouping the
 * thousands, two places after the point -- while it is typed, and still has to
 * submit a plain number the server can read. These pin both halves. */

test("thousands are grouped with commas as digits arrive", () => {
  expect(groupAmountInput("1")).toBe("1");
  expect(groupAmountInput("1234")).toBe("1,234");
  expect(groupAmountInput("1234567")).toBe("1,234,567");
  // Re-grouping what is already grouped must not double anything up.
  expect(groupAmountInput("1,2345")).toBe("12,345");
});

test("at most two places after the point, and only one point", () => {
  expect(groupAmountInput("1234.5")).toBe("1,234.5");
  expect(groupAmountInput("1234.567")).toBe("1,234.56");
  expect(groupAmountInput("12.3.4")).toBe("12.34");
});

test("anything that isn't a digit or the point is dropped, so a paste still lands", () => {
  expect(groupAmountInput("₱ 12,345.6")).toBe("12,345.6");
  expect(groupAmountInput("abc")).toBe("");
});

test("leading zeros go, but a lone point becomes 0.", () => {
  expect(groupAmountInput("007")).toBe("7");
  expect(groupAmountInput(".")).toBe("0.");
  expect(groupAmountInput("0.5")).toBe("0.5");
});

test("leaving the field pads to exactly two places", () => {
  expect(finishAmountInput("1,234")).toBe("1,234.00");
  expect(finishAmountInput("1,234.5")).toBe("1,234.50");
  expect(finishAmountInput("0.")).toBe("0.00");
  // An empty field stays empty -- the budget is optional, not zero.
  expect(finishAmountInput("")).toBe("");
});

test("what the form submits is the plain number, commas gone", () => {
  expect(amountValue("12,345.60")).toBe("12345.60");
  expect(amountValue("")).toBe("");
});

test("a stored budget opens as the same accounting figure", () => {
  expect(amountDisplay(12345.6)).toBe("12,345.60");
  expect(amountDisplay("250000")).toBe("250,000.00");
  expect(amountDisplay(null)).toBe("");
  expect(amountDisplay(undefined)).toBe("");
});

test("the caret stays beside the digit it was after when a comma appears", () => {
  // Typing a 4th digit at the end: stays at the end.
  expect(caretAfterReformat("1234", 4, "1,234")).toBe(5);
  // Editing mid-number: "12|34" typed into as "125|34" -> "12,5|34".
  expect(caretAfterReformat("12534", 3, "12,534")).toBe(4);
  expect(caretAfterReformat("1234", 0, "1,234")).toBe(0);
});

test("a budget reads back in its own currency, always with two places", () => {
  expect(formatAccounting(12345, "PHP")).toBe("₱12,345.00");
  expect(formatAccounting(12345.5, "USD")).toBe("$12,345.50");
  expect(formatAccounting(0.5, "EUR")).toBe("€0.50");
  // A code outside the list still reads, prefixed rather than guessed at.
  expect(formatAccounting(10, "JPY")).toBe("JPY 10.00");
});
