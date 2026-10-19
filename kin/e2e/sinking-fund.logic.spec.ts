import { test, expect } from "@playwright/test";
import { addYears, canMarkPaid, cycleStart, fundCategory, fundPlan, paydaysBetween } from "@/lib/sinking-fund";

/** Sinking funds, without a browser or a database: kinsenas paydays, what
 * to set aside each payday and month, and whether a fund is on track. */

test("paydaysBetween: the 15th and the month's last day, both ends included", () => {
  expect(paydaysBetween("2026-10-19", "2026-12-15")).toEqual(["2026-10-31", "2026-11-15", "2026-11-30", "2026-12-15"]);
  expect(paydaysBetween("2027-02-01", "2027-03-01")).toEqual(["2027-02-15", "2027-02-28"]);
  expect(paydaysBetween("2028-02-16", "2028-02-29")).toEqual(["2028-02-29"]);
  expect(paydaysBetween("2026-12-20", "2027-01-15")).toEqual(["2026-12-31", "2027-01-15"]);
  expect(paydaysBetween("2026-10-20", "2026-10-19")).toEqual([]);
});

test("addYears keeps the day, and 29 February becomes the 28th", () => {
  expect(addYears("2026-06-01", 1)).toBe("2027-06-01");
  expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
  expect(addYears("2027-06-01", -1)).toBe("2026-06-01");
});

test("fundPlan: tuition of 60,000 due 1 June, starting from nothing in October", () => {
  const plan = fundPlan({ target: 60000, saved: 0, due: "2027-06-01", today: "2026-10-19", cycleStart: "2026-10-19" });
  // 31 Oct, then two a month November to May: 1 + 14 = 15 paydays.
  expect(plan.paydays).toBe(15);
  expect(plan.perPayday).toBe(4000);
  expect(plan.perMonth).toBe(8000);
  expect(plan.left).toBe(60000);
  expect(plan.status).toBe("on_track");
});

test("fundPlan: on track until a payday passes without money put by", () => {
  const base = { target: 60000, due: "2027-06-01", cycleStart: "2026-10-19" };
  expect(fundPlan({ ...base, saved: 0, today: "2026-10-31" }).status).toBe("on_track");
  const missed = fundPlan({ ...base, saved: 0, today: "2026-11-01" });
  expect(missed.status).toBe("behind");
  expect(missed.shouldHave).toBe(4000);
  // Catching up spreads what is left over fewer paydays.
  expect(missed.perPayday).toBeCloseTo(60000 / 14, 1);
  expect(fundPlan({ ...base, saved: 4000, today: "2026-11-01" }).status).toBe("on_track");
});

test("fundPlan: funded, overdue, and no payday left", () => {
  expect(fundPlan({ target: 5000, saved: 5200, due: "2026-11-30", today: "2026-11-01", cycleStart: "2026-01-01" })).toMatchObject({ status: "funded", left: 0, perPayday: 0, perMonth: 0 });
  expect(fundPlan({ target: 5000, saved: 1000, due: "2026-11-10", today: "2026-11-12", cycleStart: "2026-01-01" }).status).toBe("overdue");
  const lastMinute = fundPlan({ target: 5000, saved: 1000, due: "2026-11-10", today: "2026-11-02", cycleStart: "2026-11-01" });
  expect(lastMinute).toMatchObject({ paydays: 0, perPayday: 4000, perMonth: 4000 });
});

test("cycleStart: a yearly fund saves from last year's due date; a one-off from its creation", () => {
  expect(cycleStart({ createdDay: "2025-03-01", due: "2026-12-01", repeatsYearly: true })).toBe("2025-12-01");
  expect(cycleStart({ createdDay: "2026-10-19", due: "2027-06-01", repeatsYearly: true })).toBe("2026-10-19");
  expect(cycleStart({ createdDay: "2025-03-01", due: "2026-12-01", repeatsYearly: false })).toBe("2025-03-01");
});

test("canMarkPaid: from a month before the due date, and after it", () => {
  expect(canMarkPaid("2026-11-19", "2026-10-19")).toBe(true);
  expect(canMarkPaid("2026-11-20", "2026-10-19")).toBe(false);
  expect(canMarkPaid("2026-01-15", "2026-10-19")).toBe(true);
  expect(canMarkPaid("2027-01-31", "2026-12-31")).toBe(true);
  expect(canMarkPaid("2026-02-28", "2026-01-31")).toBe(true);
});

test("fundCategory guesses where the payment belongs", () => {
  expect(fundCategory("Tuition · Ana")).toBe("Education");
  expect(fundCategory("Car registration")).toBe("Transport");
  expect(fundCategory("Insurance premium")).toBe("Insurance");
  expect(fundCategory("Christmas")).toBe("Shopping");
  expect(fundCategory("Cartoon subscription")).toBe("Other");
});
