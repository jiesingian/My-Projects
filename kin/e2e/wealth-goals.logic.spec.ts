import { test, expect } from "@playwright/test";
import { milestoneOf, accountProgress, limitProgress, loanPace, loanProgress, monthsUntil, onTimeRun, trackKey } from "@/lib/wealth-goals";

/** 🎯 "Make it a goal" on Wealth (src/lib/wealth-goals.ts): how each thing
 * followed fills its goal. */

test("a savings account fills to its balance target", () => {
  expect(accountProgress(30000, 100000)).toEqual({ current: 30000, fraction: 0.3, reached: false });
  expect(accountProgress(120000, 100000).reached).toBe(true);
  expect(accountProgress(-500, 100000).fraction).toBe(0);
});

test("a loan fills by what is paid down since the goal was set", () => {
  // Set at 500k owed, to owe 200k: 300k to pay down; 410k now = 90k paid.
  expect(loanProgress(500000, 410000, 200000)).toEqual({ current: 90000, target: 300000, fraction: 0.3, reached: false });
  expect(loanProgress(500000, 0, 0).reached).toBe(true);
});

test("a loan's pace: on track with its payment, or the extra a month that gets there", () => {
  // 100k at 0%, 10k a month: paid off in 10 months.
  expect(loanPace(100000, 0, 10000, 0, 10)).toEqual({ onTrack: true, extra: 0 });
  // In 5 months it needs 20k a month: 10k extra.
  expect(loanPace(100000, 0, 10000, 0, 5)).toEqual({ onTrack: false, extra: 10000 });
  // With interest the extra is a little more than the plain split.
  const p = loanPace(100000, 12, 5000, 0, 10);
  expect(p.onTrack).toBe(false);
  expect(p.extra!).toBeGreaterThan(5000);
  expect(p.extra!).toBeLessThan(6000);
  // Already there.
  expect(loanPace(0, 10, 0, 0, 0)).toEqual({ onTrack: true, extra: 0 });
  // Its date has come and it's still owed: no pace to give.
  expect(loanPace(5000, 0, 1000, 0, 0)).toEqual({ onTrack: false, extra: null });
});

test("an expense limit: spent, left, and how far past", () => {
  expect(limitProgress(3000, 5000)).toEqual({ current: 3000, fraction: 0.6, left: 2000, over: 0 });
  expect(limitProgress(6500, 5000)).toEqual({ current: 6500, fraction: 1, left: 0, over: 1500 });
});

test("on time: the run of payments that came on their day and in full", () => {
  const o = (expected: string, receivedOn: string | null, received: number | null, amount = 30000) => ({ expected, amount, receivedOn, received });
  const today = "2026-10-29";
  expect(onTimeRun([o("2026-08-15", "2026-08-15", 30000), o("2026-09-15", "2026-09-14", 30000), o("2026-10-15", "2026-10-15T09:00:00Z", 30000)], today)).toEqual({ run: 3, late: null });
  // September came short (deductions): the run is October only.
  expect(onTimeRun([o("2026-08-15", "2026-08-15", 30000), o("2026-09-15", "2026-09-15", 28500), o("2026-10-15", "2026-10-15", 30000)], today)).toEqual({ run: 1, late: { expected: "2026-09-15", why: "short" } });
  // October came late.
  expect(onTimeRun([o("2026-09-15", "2026-09-15", 30000), o("2026-10-15", "2026-10-17", 30000)], today).late).toEqual({ expected: "2026-10-15", why: "late" });
  // Still not in, past its day.
  expect(onTimeRun([o("2026-09-15", "2026-09-15", 30000), o("2026-10-28", null, null)], today)).toEqual({ run: 0, late: { expected: "2026-10-28", why: "missing" } });
  // Due today and not in yet is not late; one not yet due doesn't count.
  expect(onTimeRun([o("2026-09-29", "2026-09-29", 30000), o("2026-10-29", null, null), o("2026-11-29", null, null)], today)).toEqual({ run: 1, late: null });
});

test("months until a date, and the keys an entry and its goal meet on", () => {
  expect(monthsUntil("2026-10-29", "2027-04-29")).toBe(6);
  expect(monthsUntil("2026-10-29", "2027-04-28")).toBe(5);
  expect(monthsUntil("2026-10-29", "2026-09-01")).toBe(0);
  expect(trackKey("account", "a1")).toBe("account:a1");
  expect(trackKey("expense", "Dining out")).toBe("expense:family:Dining out");
  expect(trackKey("expense", "Dining out", "m1")).toBe("expense:m1:Dining out");
});

test("milestones: the highest of 25, 50, 75 and 100 passed", () => {
  expect(milestoneOf(0.1, false)).toBe(0);
  expect(milestoneOf(0.25, false)).toBe(25);
  expect(milestoneOf(0.74, false)).toBe(50);
  // Full but not reached (a rounding hair): 75 until it is.
  expect(milestoneOf(1, false)).toBe(75);
  expect(milestoneOf(0.4, true)).toBe(100);
});
