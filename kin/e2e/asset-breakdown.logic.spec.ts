import { test, expect } from "@playwright/test";
import { assetWorth, itemWorth, propertyWorth } from "@/lib/wealth";

/** What a property is made of (12 October): the place gains or loses by its
 * yearly change, appliances and furniture lose about a tenth a year, fees
 * are spent, and a typed resale value wins over the estimate. */
const house = { value: 5_000_000, annual_change_pct: 5, valued_on: "2024-10-12" };

test("the place itself compounds its yearly change from the day it was valued", () => {
  expect(propertyWorth(house, "2024-10-12")).toBe(5_000_000);
  expect(propertyWorth(house, "2026-10-12")).toBeCloseTo(5_512_500, -3);
  expect(propertyWorth({ ...house, annual_change_pct: -2 }, "2026-10-12")).toBeCloseTo(4_802_000, -3);
  expect(propertyWorth({ ...house, annual_change_pct: null }, "2030-01-01")).toBe(5_000_000);
});

test("an appliance loses a tenth a year, down to a tenth of its price", () => {
  const aircon = { kind: "appliance", cost: 40_000, acquired_on: "2021-10-12", value_now: null };
  expect(itemWorth(aircon, "2021-10-12")).toBe(40_000);
  expect(itemWorth(aircon, "2026-10-12")).toBeCloseTo(20_000, -2);
  expect(itemWorth(aircon, "2040-01-01")).toBe(4_000);
});

test("gadgets lose a fifth a year; no date means bought today", () => {
  expect(itemWorth({ kind: "electronics", cost: 50_000, acquired_on: "2024-10-12", value_now: null }, "2026-10-12")).toBeCloseTo(30_000, -2);
  expect(itemWorth({ kind: "electronics", cost: 50_000, acquired_on: null, value_now: null }, "2026-10-12")).toBe(50_000);
});

test("fees are spent, a renovation follows the place, a typed resale value wins", () => {
  expect(itemWorth({ kind: "fees", cost: 120_000, acquired_on: "2024-01-01", value_now: null }, "2026-10-12")).toBe(0);
  expect(itemWorth({ kind: "improvement", cost: 300_000, acquired_on: "2024-10-12", value_now: null }, "2026-10-12", 5)).toBeCloseTo(330_750, -2);
  expect(itemWorth({ kind: "improvement", cost: 300_000, acquired_on: "2024-10-12", value_now: null }, "2026-10-12")).toBe(300_000);
  expect(itemWorth({ kind: "appliance", cost: 40_000, acquired_on: "2016-01-01", value_now: 15_000 }, "2026-10-12")).toBe(15_000);
});

test("the total is the place plus its items; what was put in counts every price", () => {
  const items = [
    { kind: "appliance", cost: 40_000, acquired_on: "2021-10-12", value_now: null },
    { kind: "fees", cost: 60_000, acquired_on: "2025-01-01", value_now: null },
  ];
  const w = assetWorth({ ...house, annual_change_pct: null }, items, "2026-10-12");
  expect(w.property).toBe(5_000_000);
  expect(w.items).toBeCloseTo(20_000, -2);
  expect(w.total).toBeCloseTo(5_020_000, -2);
  expect(w.putIn).toBe(5_100_000);
  expect(assetWorth({ ...house, annual_change_pct: null }, [], "2026-10-12").total).toBe(5_000_000);
});
