import { test, expect } from "@playwright/test";
import {
  CURRENCIES,
  DATE_FORMATS,
  WEEK_STARTS,
  isCurrencyCode,
  isDateFormat,
  isWeekStart,
} from "@/lib/household-prefs";
import { formatCurrency } from "@/lib/format";

/** What a household's three preferences may be.
 *
 * updateHouseholdPrefsAction checked `country` and wrote the other three
 * through unchecked, with a comment above it explaining exactly why that was
 * wrong -- a form field is a request, not a fact, because a Server Action is
 * a public endpoint whatever the select above it offers. None of the three
 * has a CHECK constraint behind it either, so nothing anywhere said no.
 *
 * Measured on 9 September against the throwaway household: a 2,000-character
 * "currency" was accepted, stored, and prefixed to every amount in the
 * household. The two that follow it fail more quietly and are worth as much
 * attention -- an unrecognised date format or week start falls back to a
 * default, so the save reports success and the household is shown a
 * preference nobody chose.
 */

test("the currencies on offer are accepted", () => {
  for (const c of CURRENCIES) expect(isCurrencyCode(c.code), c.code).toBe(true);
});

test("anything else is not a currency", () => {
  expect(isCurrencyCode("GBP"), "plausible, but not offered").toBe(false);
  expect(isCurrencyCode("php"), "the stored value is compared exactly").toBe(false);
  expect(isCurrencyCode(""), "blank is not a currency -- unlike country, this one is required").toBe(false);
  expect(isCurrencyCode("X".repeat(2000)), "the one that was actually stored").toBe(false);
});

test("why a long currency was worth refusing rather than trimming", () => {
  // formatCurrency prefixes whatever it is given to every amount, so this is
  // not a cosmetic problem with one field -- it is every number on every
  // screen, for everybody in the household, until somebody changes it back.
  const sane = formatCurrency(4380.5, "PHP");
  const hostile = formatCurrency(4380.5, "X".repeat(2000));
  expect(sane.length).toBeLessThan(12);
  expect(hostile.length).toBeGreaterThan(2000);
});

test("the date formats on offer are accepted, and nothing else is", () => {
  for (const f of DATE_FORMATS) expect(isDateFormat(f), f).toBe(true);
  expect(isDateFormat("YYYY-MM-DD"), "reasonable, and still not one of the two").toBe(false);
  expect(isDateFormat("not-a-format")).toBe(false);
  expect(isDateFormat("")).toBe(false);
});

test("a week starts on a Monday or a Sunday and nothing else", () => {
  for (const w of WEEK_STARTS) expect(isWeekStart(w.value), w.value).toBe(true);
  expect(isWeekStart("Monday"), "the stored value is lowercase and compared exactly").toBe(false);
  expect(isWeekStart("chewsday")).toBe(false);
  expect(isWeekStart("")).toBe(false);
});

test("every option the form renders is one the server will accept", () => {
  // The whole point of the shared lists: the select is built from these, so a
  // choice a member can actually make can never be refused on save, and an
  // option added on one side alone cannot silently widen the other.
  for (const c of CURRENCIES) expect(isCurrencyCode(c.code)).toBe(true);
  for (const f of DATE_FORMATS) expect(isDateFormat(f)).toBe(true);
  for (const w of WEEK_STARTS) expect(isWeekStart(w.value)).toBe(true);
  expect(CURRENCIES.length + DATE_FORMATS.length + WEEK_STARTS.length, "the three lists are not empty").toBeGreaterThan(5);
});
