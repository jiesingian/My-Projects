import { test, expect } from "@playwright/test";
import { startOfWeek, weekStartOf, dayColumn } from "@/lib/week";

/** Which day a week begins on, and why the answer has to reach every caller.
 *
 * lib/week.ts was written because "Every calendar in the app laid its columns
 * out with getDay(), which counts from Sunday, so the setting saved cleanly
 * and changed nothing." The Planner was converted. Today's Planner hub card
 * was not, and went on counting "N THIS WEEK" from getDay() while the Planner
 * it links to drew its columns from the preference.
 *
 * These pin the difference the preference actually makes, which is the reason
 * a caller cannot quietly keep using getDay() and be nearly right.
 */

// A Sunday and the Monday after it, stated rather than computed, so a bug in
// the arithmetic below cannot also produce the fixture that hides it.
const SUNDAY = new Date("2026-09-13T12:00:00+08:00");
const MONDAY = new Date("2026-09-14T12:00:00+08:00");

test("the preference is read, and anything unrecognised is Sunday", () => {
  expect(weekStartOf("monday")).toBe(1);
  expect(weekStartOf("sunday")).toBe(0);
  // The fallback is Sunday because that is what getDay() counts from, and so
  // what the app did before anybody read the setting at all.
  expect(weekStartOf(null)).toBe(0);
  expect(weekStartOf(undefined)).toBe(0);
  expect(weekStartOf("chewsday")).toBe(0);
});

test("a Sunday belongs to different weeks depending on the answer", () => {
  // The case that made the two disagree by a whole week. Under Sunday-start
  // this Sunday opens a new week; under Monday-start it closes the old one.
  const asSunday = startOfWeek(SUNDAY, weekStartOf("sunday"));
  const asMonday = startOfWeek(SUNDAY, weekStartOf("monday"));
  expect(asSunday.getDate(), "Sunday starts its own week").toBe(13);
  expect(asMonday.getDate(), "or is the last day of the week before").toBe(7);
  expect(
    Math.round((asSunday.getTime() - asMonday.getTime()) / 86_400_000),
    "six days apart, which is the whole of the disagreement",
  ).toBe(6);
});

test("a Monday is the same week either way, which is why this hid", () => {
  // Six days in seven, both answers agree, so a caller using the wrong one
  // looks correct almost all the time and is wrong on exactly one day.
  const asSunday = startOfWeek(MONDAY, weekStartOf("sunday"));
  const asMonday = startOfWeek(MONDAY, weekStartOf("monday"));
  expect(asMonday.getDate()).toBe(14);
  expect(asSunday.getDate()).toBe(13);
  expect(dayColumn(MONDAY, weekStartOf("monday")), "first column under Monday-start").toBe(0);
  expect(dayColumn(MONDAY, weekStartOf("sunday")), "second column under Sunday-start").toBe(1);
});

test("every day lands in a column, and no two share one", () => {
  for (const pref of ["monday", "sunday"] as const) {
    const start = weekStartOf(pref);
    const columns = new Set<number>();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(SUNDAY);
      d.setDate(SUNDAY.getDate() + i);
      const col = dayColumn(d, start);
      expect(col, `${pref}: column out of range`).toBeGreaterThanOrEqual(0);
      expect(col, `${pref}: column out of range`).toBeLessThan(7);
      columns.add(col);
    }
    expect(columns.size, `${pref}: seven days should fill seven columns`).toBe(7);
  }
});
