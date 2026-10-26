import { test, expect } from "@playwright/test";
import { netWorthSeries, periodLongLabel, recentPeriods } from "@/lib/wealth";

/** The net-worth line from one row a day (20261027120000): the last day
 * recorded in each period, a quiet period carrying the figure before it,
 * nothing drawn ahead of the first record. */

const anchor = new Date(2026, 9, 27); // 27 October 2026, a Tuesday

test("a period's figure is its last recorded day's", () => {
  const periods = recentPeriods("month", 3, anchor); // AUG, SEP, OCT
  const points = netWorthSeries(
    [
      { day: "2026-09-03", netWorth: 100 },
      { day: "2026-09-28", netWorth: 150 },
      { day: "2026-10-27", netWorth: 200 },
    ],
    "month",
    periods,
  );
  expect(points.map((p) => [p.key, p.netWorth])).toEqual([
    ["2026-09", 150],
    ["2026-10", 200],
  ]);
  expect(points[0].longLabel).toBe("September 2026");
});

test("a period nobody opened Wealth in carries the figure before it, and the window's first periods carry `before`", () => {
  const periods = recentPeriods("day", 4, anchor); // 24..27 Oct
  const points = netWorthSeries([{ day: "2026-10-26", netWorth: 900, parts: { cash: 900, goals: 0, assets: 0, liabilities: 0 } }], "day", periods, { netWorth: 800 });
  expect(points.map((p) => p.netWorth)).toEqual([800, 800, 900, 900]);
  expect(points[3].parts?.cash).toBe(900);
  expect(points[0].longLabel).toBe("24 October 2026");
});

test("nothing is drawn ahead of the first record", () => {
  const periods = recentPeriods("week", 3, anchor);
  expect(netWorthSeries([], "week", periods)).toEqual([]);
  const points = netWorthSeries([{ day: "2026-10-27", netWorth: 5 }], "week", periods);
  expect(points).toHaveLength(1);
  expect(points[0].longLabel).toMatch(/^Week of \d+ October 2026$/);
});

test("periodLongLabel names each step in full", () => {
  expect(periodLongLabel(new Date(2026, 0, 1), "year")).toBe("2026");
  expect(periodLongLabel(new Date(2026, 9, 1), "month")).toBe("October 2026");
  expect(periodLongLabel(new Date(2026, 9, 27), "day")).toBe("27 October 2026");
});
