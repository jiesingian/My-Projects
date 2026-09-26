import { test, expect } from "@playwright/test";
import { toSamples, numberIn, dayIn, manilaToday } from "@/lib/apple-health";

/** What an iPhone Shortcut sends to api/health/apple. Shortcuts is loose
 * about types, so these are the shapes it has been known to produce. */

const TODAY = "2026-09-26";

test("a plain dictionary of today's readings", () => {
  expect(toSamples({ steps: 8423, weight: 68.2, heart_rate: 61, sleep: 7.5 }, TODAY)).toEqual([
    { type: "steps", value: 8423, date: TODAY },
    { type: "weight", value: 68.2, date: TODAY },
    { type: "heart_rate", value: 61, date: TODAY },
    { type: "sleep", value: 7.5, date: TODAY },
  ]);
});

test("numbers that arrive as text, with commas or units", () => {
  expect(numberIn("8,423")).toBe(8423);
  expect(numberIn("68.2 kg")).toBe(68.2);
  expect(numberIn("61 count/min")).toBe(61);
  expect(numberIn("1,234,567")).toBe(1234567);
  expect(numberIn("none")).toBeNull();
  expect(numberIn(Number.NaN)).toBeNull();
  expect(toSamples({ steps: "8,423", weight: "150 lb" }, TODAY)).toEqual([
    { type: "steps", value: 8423, date: TODAY },
    { type: "weight", value: 150, date: TODAY, unit: "lb" },
  ]);
});

test("sleep totalled in minutes becomes hours", () => {
  expect(toSamples({ sleep: 450 }, TODAY)).toEqual([{ type: "sleep", value: 7.5, date: TODAY }]);
});

test("the Shortcut's own date, with or without a time on it", () => {
  expect(dayIn("2026-09-25T23:00:00+08:00")).toBe("2026-09-25");
  expect(dayIn("Sep 25, 2026")).toBeNull();
  expect(toSamples({ date: "2026-09-25T23:00:00+08:00", steps: 10 }, TODAY)[0].date).toBe("2026-09-25");
  expect(toSamples({ date: "yesterday", steps: 10 }, TODAY)[0].date).toBe(TODAY);
});

test("unknown keys and empty values are left out, not guessed", () => {
  expect(toSamples({ blood_pressure: "120/80", calories: 2000, steps: "" }, TODAY)).toEqual([]);
  expect(toSamples(null, TODAY)).toEqual([]);
  expect(toSamples("steps=5", TODAY)).toEqual([]);
});

test("a samples array for several days", () => {
  expect(
    toSamples({ samples: [{ type: "steps", value: 5000, date: "2026-09-24" }, { type: "resting_heart_rate", value: "58", date: "2026-09-25" }, { type: "mood", value: 3 }] }, TODAY),
  ).toEqual([
    { type: "steps", value: 5000, date: "2026-09-24" },
    { type: "heart_rate", value: 58, date: "2026-09-25" },
  ]);
});

test("today is Manila's today", () => {
  // 17:00 UTC on the 25th is 01:00 on the 26th in Manila.
  expect(manilaToday(new Date("2026-09-25T17:00:00Z"))).toBe("2026-09-26");
});
