import { test, expect } from "@playwright/test";
import { monthlyNeeded } from "@/lib/goal-plan";

/** A goal's monthly amount (src/lib/goal-plan.ts). */
test("the target over the months from start to end, both counted, rounded up", () => {
  expect(monthlyNeeded(40000, "2026-11-01", "2027-06-30")).toEqual({ months: 8, perMonth: 5000 });
  expect(monthlyNeeded(10000, "2026-10-26", "2027-01-15")).toEqual({ months: 4, perMonth: 2500 });
  expect(monthlyNeeded(1000, "2026-10-01", "2026-12-31")).toEqual({ months: 3, perMonth: 334 });
});

test("the same month is one month", () => {
  expect(monthlyNeeded(5000, "2026-10-01", "2026-10-31")).toEqual({ months: 1, perMonth: 5000 });
});

test("nothing to say without an amount, without dates, or with an end before the start", () => {
  expect(monthlyNeeded(0, "2026-10-01", "2026-12-31")).toBeNull();
  expect(monthlyNeeded(5000, "2026-10-01", "")).toBeNull();
  expect(monthlyNeeded(5000, "2027-01-01", "2026-12-31")).toBeNull();
});
