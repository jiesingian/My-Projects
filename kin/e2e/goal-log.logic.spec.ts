import { test, expect } from "@playwright/test";
import { daysBefore, isLoggableDay, stepsForDay } from "@/lib/goals";

/** Logging a goal by hand (Jonathan, 13 October): a day's steps are counted
 * once whichever way they arrived, and an entry can be dated back a week. */

test("steps from the watch and by hand count once: the higher of the two", () => {
  expect(stepsForDay([{ source: "apple_health", value: 4210 }, { source: "manual", value: 9000 }])).toBe(9000);
  expect(stepsForDay([{ source: "apple_health", value: 11000 }, { source: "manual", value: 9000 }])).toBe(11000);
});

test("only one source still counts", () => {
  expect(stepsForDay([{ source: "manual", value: 6500 }])).toBe(6500);
  expect(stepsForDay([{ source: "apple_health", value: 6500 }])).toBe(6500);
  expect(stepsForDay([])).toBe(0);
});

test("two readings from the same source on one day are not added", () => {
  expect(stepsForDay([{ source: "apple_health", value: 3000 }, { source: "apple_health", value: 5000 }])).toBe(5000);
});

test("an entry may be dated today or up to six days back, never ahead", () => {
  const today = "2026-10-13";
  expect(isLoggableDay(today, today)).toBe(true);
  expect(isLoggableDay("2026-10-07", today)).toBe(true);
  expect(isLoggableDay("2026-10-06", today)).toBe(false);
  expect(isLoggableDay("2026-10-14", today)).toBe(false);
  expect(isLoggableDay("13 Oct", today)).toBe(false);
});

test("counting days back crosses months", () => {
  expect(daysBefore("2026-11-02", 3)).toBe("2026-10-30");
  expect(daysBefore("2026-03-01", 1)).toBe("2026-02-28");
});
