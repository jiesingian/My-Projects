import { test, expect } from "@playwright/test";
import { formatDate, formatAge, spellDate } from "@/lib/format";

/** Showing a stored date as the day it actually is.
 *
 * `new Date("2018-09-06")` is UTC midnight, and `getDate()` is local. Put
 * those together and one stored date renders as two different days depending
 * on where it is read — the server sits in Asia/Manila, a browser in the
 * Americas is hours behind. Measured 9 September on a member's date of birth:
 *
 *   server   06/09/2018
 *   browser  07/09/2018
 *
 * React calls that a hydration mismatch, which is how it surfaced: a new test
 * on the member profile page caught the page throwing. A person calls it the
 * wrong birthday.
 *
 * `spellDate`, four functions below it in the same file, already parsed the
 * string rather than trusting Date — with a comment about "the same trap that
 * walked the planner's times back eight hours". So the lesson was known and
 * written down, and formatDate was simply missed. That is the argument for
 * these tests: the knowledge existed and did not stop the bug.
 *
 * Note the suite's own arrangement makes this checkable at all — the browser
 * project is pinned to America/New_York, a zone that never agrees with the
 * household, and the process runs in UTC.
 */

test("a plain date reads the same wherever it is rendered", () => {
  // The digits are the answer. No clock is consulted, so there is no zone in
  // which this can differ.
  expect(formatDate("2018-09-06")).toBe("06/09/2018");
  expect(formatDate("2018-09-06", "MM/DD/YYYY")).toBe("09/06/2018");
});

test("the first and last day of a month do not slip", () => {
  // These are the ones a zone shift moves into a different month, and a
  // birthday on the 1st shown as the 31st of the month before is the kind of
  // thing somebody notices immediately.
  expect(formatDate("2026-01-01")).toBe("01/01/2026");
  expect(formatDate("2026-12-31")).toBe("31/12/2026");
  expect(formatDate("2026-03-01")).toBe("01/03/2026");
});

test("a real timestamp still renders in the reader's own zone", () => {
  // The distinction the fix rests on: a date of birth is a day, an
  // appointment is an instant. Only the first is read from its digits.
  const at = new Date("2026-09-15T11:00:00.000Z");
  expect(formatDate(at)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  expect(formatDate("2026-09-15T11:00:00.000Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
});

test("an age is counted from the date, not from the reader's midnight", () => {
  const twoThousand = formatAge("2000-01-01");
  expect(Number(twoThousand)).toBeGreaterThan(20);
  expect(formatAge(null)).toBe("age unknown");
});

test("a baby is counted in months", () => {
  const lastMonth = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
  expect(formatAge(lastMonth)).toMatch(/month/);
});

test("spellDate and formatDate agree on which day it is", () => {
  // They are shown together beneath every date picker — one as digits, one
  // spelled out. Disagreeing would be worse than either being wrong alone.
  for (const day of ["2018-09-06", "2026-01-01", "2026-12-31", "2028-02-29"]) {
    const spelled = spellDate(day);
    const [dd, mm, yyyy] = formatDate(day).split("/");
    expect(spelled, day).toContain(String(Number(dd)));
    expect(spelled, day).toContain(yyyy);
    expect(mm, day).toBe(day.slice(5, 7));
  }
});
