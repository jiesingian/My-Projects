import { test, expect } from "@playwright/test";
import { shouldReturnToToday, RETURN_AFTER_MS } from "@/lib/return-to-today";

/** Coming back to Kin after 30+ minutes away opens Today; a quick trip to
 * another app comes back exactly where it was. */

test("a short trip away comes back where it was", () => {
  expect(shouldReturnToToday({ awayMs: 5 * 60_000, pathname: "/wealth", hasUnsavedInput: false })).toBe(false);
  expect(shouldReturnToToday({ awayMs: RETURN_AFTER_MS - 1, pathname: "/wealth", hasUnsavedInput: false })).toBe(false);
});

test("30 minutes or more away opens Today", () => {
  expect(shouldReturnToToday({ awayMs: RETURN_AFTER_MS, pathname: "/wealth", hasUnsavedInput: false })).toBe(true);
  expect(shouldReturnToToday({ awayMs: 6 * 3600_000, pathname: "/planner/add", hasUnsavedInput: false })).toBe(true);
});

test("already on Today, nothing happens", () => {
  expect(shouldReturnToToday({ awayMs: 6 * 3600_000, pathname: "/today", hasUnsavedInput: false })).toBe(false);
});

test("something typed and not saved is never thrown away", () => {
  expect(shouldReturnToToday({ awayMs: 6 * 3600_000, pathname: "/journal/new", hasUnsavedInput: true })).toBe(false);
});

test("a nonsense time away changes nothing", () => {
  expect(shouldReturnToToday({ awayMs: NaN, pathname: "/wealth", hasUnsavedInput: false })).toBe(false);
  expect(shouldReturnToToday({ awayMs: -1, pathname: "/wealth", hasUnsavedInput: false })).toBe(false);
});
