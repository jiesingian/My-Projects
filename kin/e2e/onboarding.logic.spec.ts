import { test, expect } from "@playwright/test";
import { birthdayProblem, familyDay, addDays } from "@/lib/time";

/** What a date of birth may be, checked at the one place that collects it.
 *
 * Onboarding took whatever the date field handed it. That mattered because
 * nothing downstream ever objected: formatAge clamps a negative age with
 * `Math.max(months, 0)`, so a birthday in the future is rendered as
 * "0 months" -- a person born in 2035 shows up in the members list as a
 * newborn, indistinguishable from a real one, and no screen anywhere says
 * the date is impossible.
 *
 * The two mistakes a date input actually produces are a year typed as this
 * year instead of the one meant, and a four-digit year typed short. Both are
 * silent today. These pin the refusals so they stay refusals.
 */

test("a birthday in the future is refused", () => {
  const tomorrow = addDays(familyDay(), 1)!;
  expect(birthdayProblem(tomorrow)).toBe("A date of birth can't be in the future.");
  expect(birthdayProblem("2099-01-01")).toBe("A date of birth can't be in the future.");
});

test("today is allowed -- somebody is born every day", () => {
  expect(birthdayProblem(familyDay())).toBeNull();
});

test("an ordinary birthday passes", () => {
  expect(birthdayProblem("1985-04-23")).toBeNull();
  expect(birthdayProblem("2019-12-31")).toBeNull();
  expect(birthdayProblem("1900-01-01")).toBeNull();
});

test("a year short of four digits is caught rather than stored", () => {
  // The typo this exists for: 0219 for 2019. It parses, it is in the past,
  // and it would be recorded as a 1,800-year-old member without this.
  expect(birthdayProblem("0219-12-31")).toBe("Check the year on that date of birth.");
  expect(birthdayProblem("1899-12-31")).toBe("Check the year on that date of birth.");
});

test("a date that is not a date is refused, including one Date would roll over", () => {
  expect(birthdayProblem("")).toBe("That date of birth isn't a real date.");
  expect(birthdayProblem("not a date")).toBe("That date of birth isn't a real date.");
  expect(birthdayProblem("23/04/1985")).toBe("That date of birth isn't a real date.");
  // 31 September does not exist. `new Date` would make it 1 October without
  // a word, which is the failure familyMidnight was written to stop.
  expect(birthdayProblem("2019-09-31")).toBe("That date of birth isn't a real date.");
  expect(birthdayProblem("2019-02-30")).toBe("That date of birth isn't a real date.");
});

test("surrounding whitespace is not a reason to refuse", () => {
  expect(birthdayProblem("  1985-04-23  ")).toBeNull();
});
