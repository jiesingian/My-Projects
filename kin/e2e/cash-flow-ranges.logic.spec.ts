import { test, expect } from "@playwright/test";
import { dayKey, recentDays, periodKey, recentPeriods, cashFlowRangeCount, CASH_FLOW_RANGES, knownAppsForType, KNOWN_APPS } from "@/lib/wealth";

/** "Days" added as a fourth granularity to the Cash Flow / Accounts graph
 * range picker, alongside the existing week/month/year. Checked here
 * without a browser: the day-level date math, and that the pre-existing
 * ranges still behave the same now that a fourth one sits next to them.
 */

test("dayKey identifies one calendar day regardless of time of day", () => {
  expect(dayKey(new Date(2026, 8, 9, 23, 59))).toBe(dayKey(new Date(2026, 8, 9, 0, 1)));
  expect(dayKey("2026-09-09")).toBe("2026-09-09");
});

test("recentDays returns exactly `count` consecutive days ending today, oldest first", () => {
  const anchor = new Date(2026, 8, 9);
  const days = recentDays(5, anchor);
  expect(days).toHaveLength(5);
  expect(days.map((d) => d.key)).toEqual(["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"]);
});

test("periodKey and recentPeriods route \"day\" the same way the other three ranges already work", () => {
  const anchor = new Date(2026, 8, 9);
  expect(periodKey(anchor, "day")).toBe(dayKey(anchor));
  const periods = recentPeriods("day", 3, anchor);
  expect(periods.map((p) => p.key)).toEqual(recentDays(3, anchor).map((d) => d.key));
});

test("day is one of the four ranges the picker offers, with its own count", () => {
  expect(CASH_FLOW_RANGES).toContain("day");
  expect(CASH_FLOW_RANGES).toHaveLength(4);
  expect(cashFlowRangeCount("day")).toBeGreaterThan(0);
});

test("knownAppsForType narrows to the right kind, and only for bank/ewallet", () => {
  const bankLabels = knownAppsForType("bank").map((a) => a.label);
  expect(bankLabels).toContain("BPI");
  expect(bankLabels).not.toContain("GCash");

  const walletLabels = knownAppsForType("ewallet").map((a) => a.label);
  expect(walletLabels).toContain("GCash");
  expect(walletLabels).not.toContain("BPI");

  // Every other type shows everything -- there's no third kind to narrow
  // to, and showing nothing would be worse than showing all of it.
  for (const other of ["credit", "investment", "other"] as const) {
    expect(knownAppsForType(other)).toHaveLength(KNOWN_APPS.length);
  }
});

test("every KNOWN_APPS entry is tagged bank or ewallet, nothing else", () => {
  for (const app of KNOWN_APPS) {
    expect(["bank", "ewallet"], app.label).toContain(app.kind);
  }
});
