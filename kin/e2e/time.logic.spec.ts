import { test, expect } from "@playwright/test";
import { familyInstant, familyMidnight, familyDay } from "@/lib/time";

/** A household date plus a wall-clock time, from arguments a model wrote.
 *
 * The assistant takes what somebody typed and hands the tool a date and a
 * time. Built by hand as `new Date(\`${date}T${time}\`)` that had two failure
 * modes, both measured on 9 September:
 *
 *   "2026-09-15" + "25:00"    -> RangeError thrown out of the tool
 *   "2026-09-31" + "19:00"    -> 1 October, silently, no error at all
 *
 * The first was already caught by the API route, which told the member "that
 * didn't go through" and saved nothing — honest, but it left them no idea
 * what to change. The second was the real bug: somebody asks for the 31st of
 * a thirty-day month, which people do, and the appointment is made on a
 * different day than the one they said, with nothing anywhere to say so.
 */

test("an impossible date is refused, not rolled into the next month", () => {
  // The whole point. Date would answer 1 October for all of these.
  expect(familyInstant("2026-09-31", "19:00")).toBeNull();
  expect(familyInstant("2026-02-30", "09:00")).toBeNull();
  expect(familyInstant("2025-02-29", "09:00")).toBeNull(); // 2025 is not a leap year
  expect(familyInstant("2026-13-01", "09:00")).toBeNull();
  expect(familyInstant("2026-00-10", "09:00")).toBeNull();
});

test("a real leap day is accepted", () => {
  // Refusing too much would be its own bug.
  expect(familyInstant("2028-02-29", "09:00")).not.toBeNull();
});

test("a time that is not a time is refused rather than thrown", () => {
  for (const bad of ["25:00", "12:60", "evening", "7pm", "9:00", "", "  ", "19:00:60"]) {
    expect(familyInstant("2026-09-15", bad), `time ${JSON.stringify(bad)}`).toBeNull();
  }
});

test("a date that is not a date is refused rather than thrown", () => {
  for (const bad of ["next Tuesday", "15/09/2026", "2026-9-15", "tomorrow", ""]) {
    expect(familyInstant(bad, "19:00"), `date ${JSON.stringify(bad)}`).toBeNull();
  }
});

test("seconds are optional and both forms agree", () => {
  const without = familyInstant("2026-09-15", "19:00");
  const with00 = familyInstant("2026-09-15", "19:00:00");
  expect(without).not.toBeNull();
  expect(with00?.getTime()).toBe(without?.getTime());
});

test("the instant lands on the household's day, not the process's", () => {
  // The suite runs in UTC and the household is in Asia/Manila, so an evening
  // appointment is the case that separates the two: 19:00 in Manila is 11:00
  // UTC the same day, and a naive `new Date("...T19:00")` in a UTC process
  // would be 19:00 UTC — three in the morning tomorrow, where the family live.
  const at = familyInstant("2026-09-15", "19:00");
  expect(at).not.toBeNull();
  expect(familyDay(at!)).toBe("2026-09-15");
  expect(at!.toISOString()).toBe("2026-09-15T11:00:00.000Z");
});

test("midnight is the same instant familyMidnight gives", () => {
  // The two helpers must not disagree about when a day starts, or an all-day
  // item and a 00:00 item would land on different days.
  expect(familyInstant("2026-09-15", "00:00")?.getTime()).toBe(familyMidnight("2026-09-15")?.getTime());
});

test("the last minute of the day is still that day", () => {
  const at = familyInstant("2026-09-15", "23:59");
  expect(familyDay(at!)).toBe("2026-09-15");
});
