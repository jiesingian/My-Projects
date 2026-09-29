import { test, expect } from "@playwright/test";
import { clashes, overlaps } from "@/lib/clash";

/** A new plan clashes with one on the calendar when the times overlap and
 * they share someone; a whole-family plan shares everyone. */

const h = (n: number) => n * 3_600_000;
const plan = (start: number, end: number, wholeFamily: boolean, memberIds: string[] = []) => ({ start: h(start), end: h(end), wholeFamily, memberIds });

test("times: touching is not overlapping", () => {
  expect(overlaps({ start: h(8), end: h(9) }, { start: h(9), end: h(10) })).toBe(false);
  expect(overlaps({ start: h(8), end: h(9.5) }, { start: h(9), end: h(10) })).toBe(true);
});

test("people: someone in common, or the whole family", () => {
  expect(clashes(plan(8, 10, false, ["n"]), plan(9, 11, false, ["j"]))).toBe(false);
  expect(clashes(plan(8, 10, false, ["n", "e"]), plan(9, 11, false, ["e"]))).toBe(true);
  expect(clashes(plan(8, 10, true), plan(9, 11, false, ["j"]))).toBe(true);
  expect(clashes(plan(8, 10, false, ["j"]), plan(9, 11, false, []))).toBe(true);
});

test("no overlap in time, no clash, whoever it is for", () => {
  expect(clashes(plan(8, 9, true), plan(10, 11, true))).toBe(false);
});
