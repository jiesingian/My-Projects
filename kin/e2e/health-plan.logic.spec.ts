import { test, expect } from "@playwright/test";
import { dosesFor, parseTimes, activeOn, highBloodPressure, addDays, type Medicine } from "@/lib/health-plan";
import { growthPercentile, percentileLabel, ageInMonths, valueAtPercentile, normalCdf } from "@/lib/growth";

const amox: Medicine = { id: "m1", member_id: "keira", name: "Amoxicillin", dose: "5 ml", times: ["20:00", "08:00"], start_date: "2026-09-24", end_date: "2026-09-30" };
const vitD: Medicine = { id: "m2", member_id: "keira", name: "Vitamin D", dose: null, times: ["08:00"], start_date: "2026-01-01", end_date: null };

test("the day's doses, in time order, ticked and late", () => {
  const doses = dosesFor([amox, vitD], [{ medicine_id: "m1", dose_date: "2026-09-26", dose_time: "08:00" }], "2026-09-26", "09:30");
  expect(doses.map((d) => `${d.time} ${d.name} ${d.taken ? "taken" : d.late ? "late" : "due"}`)).toEqual([
    "08:00 Amoxicillin taken",
    "08:00 Vitamin D late",
    "20:00 Amoxicillin due",
  ]);
});

test("an hour's grace before a dose counts as late", () => {
  expect(dosesFor([vitD], [], "2026-09-26", "09:00")[0].late).toBe(false);
  expect(dosesFor([vitD], [], "2026-09-26", "09:01")[0].late).toBe(true);
});

test("a finished course isn't due, and yesterday's untaken doses are late", () => {
  expect(activeOn(amox, "2026-10-01")).toBe(false);
  expect(dosesFor([amox], [], "2026-10-01", "09:00")).toEqual([]);
  expect(dosesFor([amox], [], "2026-09-25", null, true).every((d) => d.late)).toBe(true);
});

test("times typed the way people type them", () => {
  expect(parseTimes("8am, 8pm")).toEqual(["08:00", "20:00"]);
  expect(parseTimes("08:00 20:00")).toEqual(["08:00", "20:00"]);
  expect(parseTimes("12 pm, 12am, 0730")).toEqual(["00:00", "07:30", "12:00"]);
  expect(parseTimes("morning, 25:00, 8:61")).toEqual([]);
  expect(parseTimes("8am 8am")).toEqual(["08:00"]);
});

test("high blood pressure", () => {
  expect(highBloodPressure("120/80")).toBe(false);
  expect(highBloodPressure("141/85")).toBe(true);
  expect(highBloodPressure("130 / 92")).toBe(true);
  expect(highBloodPressure("normal")).toBe(false);
});

test("WHO percentiles: the median is the 50th", () => {
  // WHO medians: girls 12 months 8.9 kg (M = 8.9481), boys at birth 3.3464 kg.
  expect(Math.round(growthPercentile("weight", 8.9481, 12, "female")!)).toBe(50);
  expect(Math.round(growthPercentile("weight", 3.3464, 0, "male")!)).toBe(50);
  expect(Math.round(growthPercentile("length", 74.0153, 12, "female")!)).toBe(50);
});

test("WHO percentiles: a lighter baby sits lower, a heavier one higher", () => {
  expect(growthPercentile("weight", 7.5, 12, "female")!).toBeLessThan(10);
  expect(growthPercentile("weight", 10.5, 12, "female")!).toBeGreaterThan(90);
});

test("outside 0 to 5 years there is no percentile, not a guess", () => {
  expect(growthPercentile("weight", 20, 61, "female")).toBeNull();
  expect(growthPercentile("weight", 3, -1, "female")).toBeNull();
});

test("the guide lines come back to the median at z = 0", () => {
  expect(valueAtPercentile("weight", 12, "female", 0)!).toBeCloseTo(8.9462, 3); // day 365 in weianthro.txt
  expect(normalCdf(1.881)).toBeCloseTo(0.97, 2);
});

test("labels and ages", () => {
  expect(percentileLabel(52.4)).toBe("52nd");
  expect(percentileLabel(11.2)).toBe("11th");
  expect(percentileLabel(0.4)).toBe("below the 1st");
  expect(Math.round(ageInMonths("2025-10-22", "2026-10-22"))).toBe(12);
  expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
});
