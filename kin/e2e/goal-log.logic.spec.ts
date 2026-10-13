import { test, expect } from "@playwright/test";
import { claimStreak, daysBefore, goalSource, isLoggableDay, periodBefore, stepsForDay, streakMilestones } from "@/lib/goals";

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

test("the period before: a day, a week, a month (across a year)", () => {
  expect(periodBefore("day", "2026-10-13")).toBe("2026-10-12");
  expect(periodBefore("week", "2026-10-12")).toBe("2026-10-05");
  expect(periodBefore("month", "2026-01-01")).toBe("2025-12-01");
});

test("a streak counts back from today, or from yesterday while today is open", () => {
  const claimed = new Set(["2026-10-10", "2026-10-11", "2026-10-12"]);
  expect(claimStreak("day", "2026-10-13", claimed)).toBe(3);
  claimed.add("2026-10-13");
  expect(claimStreak("day", "2026-10-13", claimed)).toBe(4);
  expect(claimStreak("day", "2026-10-20", claimed)).toBe(0);
});

test("a streak bonus on the 7th and the 30th day in a row, again after a break", () => {
  const run = (from: string, n: number) => Array.from({ length: n }, (_, i) => daysBefore(from, -i));
  expect(streakMilestones(run("2026-09-01", 6))).toEqual([]);
  expect(streakMilestones(run("2026-09-01", 30))).toEqual([{ date: "2026-09-07", reached: 7 }, { date: "2026-09-30", reached: 30 }]);
  expect(streakMilestones([...run("2026-09-01", 7), ...run("2026-09-10", 7)]).map((m) => m.date)).toEqual(["2026-09-07", "2026-09-16"]);
});

test("where a goal fills from, said plainly", () => {
  const now = new Date("2026-10-13T10:00:00Z");
  const base = { savingsTitle: null, mine: true, ownerFirst: "Janine", now };
  expect(goalSource("steps", { ...base, appleHealth: null })).toEqual({ text: expect.stringContaining("isn’t connected"), connect: true });
  expect(goalSource("weight", { ...base, appleHealth: { lastUsedAt: "2026-10-13T08:00:00Z" } }).text).toContain("last sent 2 h ago");
  expect(goalSource("steps", { ...base, mine: false, appleHealth: null })).toEqual({ text: expect.stringContaining("Janine’s Apple Health"), connect: false });
  expect(goalSource("water", { ...base, appleHealth: null }).text).toContain("No app sends water");
  expect(goalSource("gym", { ...base, appleHealth: null }).text).toBe("No app source — log it here.");
  expect(goalSource("money", { ...base, savingsTitle: "Japan trip", appleHealth: null }).text).toContain("“Japan trip” on Wealth");
});
