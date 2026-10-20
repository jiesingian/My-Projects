import { test, expect } from "@playwright/test";
import { currentRound, greetingName, paluwaganReminder, paymentProblem, pot, roundDate, utangLeft, utangReminder } from "@/lib/utang";

/** Utang and paluwagan, without a browser or a database: what is left on a
 * loan, the paluwagan's round dates and pot, and the reminders Kin writes
 * for a grown-up to send themselves. */

test("utangLeft sums partial payments and never goes below zero", () => {
  expect(utangLeft(5000, [])).toEqual({ paid: 0, left: 5000, settled: false });
  expect(utangLeft(5000, [{ amount: 2000 }, { amount: "500.50" }])).toEqual({ paid: 2500.5, left: 2499.5, settled: false });
  expect(utangLeft(5000, [{ amount: 5000 }])).toEqual({ paid: 5000, left: 0, settled: true });
});

test("paymentProblem refuses nothing and more than is left", () => {
  expect(paymentProblem(1000, 3000)).toBeNull();
  expect(paymentProblem(3000, 3000)).toBeNull();
  expect(paymentProblem(0, 3000)).toMatch(/how much/);
  expect(paymentProblem(3500, 3000)).toMatch(/Only 3000\.00 is left/);
});

test("roundDate: weekly, monthly (clamped to a short month), and kinsenas", () => {
  expect(roundDate("2026-10-01", "weekly", 1)).toBe("2026-10-01");
  expect(roundDate("2026-10-01", "weekly", 3)).toBe("2026-10-15");
  expect(roundDate("2026-01-31", "monthly", 2)).toBe("2026-02-28");
  expect(roundDate("2026-11-15", "monthly", 3)).toBe("2027-01-15");
  expect(roundDate("2026-10-15", "semi_monthly", 1)).toBe("2026-10-15");
  expect(roundDate("2026-10-15", "semi_monthly", 2)).toBe("2026-10-30");
  expect(roundDate("2026-10-15", "semi_monthly", 3)).toBe("2026-11-15");
  expect(roundDate("2027-02-15", "semi_monthly", 2)).toBe("2027-02-28");
  // Started after the 15th: the 30th and the 15th, every round on its own day.
  const from30 = [1, 2, 3, 4, 5, 6].map((r) => roundDate("2026-01-30", "semi_monthly", r));
  expect(from30).toEqual(["2026-01-30", "2026-02-15", "2026-02-28", "2026-03-15", "2026-03-30", "2026-04-15"]);
  const from31 = [1, 2, 3, 4].map((r) => roundDate("2026-12-31", "semi_monthly", r));
  expect(from31).toEqual(["2026-12-31", "2027-01-16", "2027-01-31", "2027-02-16"]);
  expect(new Set(from30).size).toBe(from30.length);
});

test("currentRound is the latest round that has come, up to the last", () => {
  expect(currentRound("2026-11-01", "monthly", 5, "2026-10-19")).toBe(0);
  expect(currentRound("2026-10-01", "monthly", 5, "2026-10-01")).toBe(1);
  expect(currentRound("2026-08-01", "monthly", 5, "2026-10-19")).toBe(3);
  expect(currentRound("2025-01-01", "monthly", 5, "2026-10-19")).toBe(5);
});

test("pot is every member's hulog", () => {
  expect(pot(1000, 10)).toBe(10000);
});

test("the utang reminder is for money lent, still owed, and says what came back", () => {
  const base = { personName: "Tita Baby Cruz", amount: 5000, paid: 2000, left: 3000, dueOn: null, currency: "PHP" };
  const text = utangReminder({ ...base, direction: "lent" })!;
  expect(text).toMatch(/^Hi Tita Baby!/);
  expect(text).toContain("₱5,000");
  expect(text).toContain("₱2,000");
  expect(text).toContain("₱3,000");
  expect(text).toMatch(/Walang pressure/);
  expect(utangReminder({ ...base, direction: "borrowed" })).toBeNull();
  expect(utangReminder({ ...base, direction: "lent", paid: 5000, left: 0 })).toBeNull();
  expect(utangReminder({ ...base, direction: "lent", paid: 0, left: 5000 })).not.toMatch(/naibalik/);
});

test("the paluwagan reminder names the group, round and hulog", () => {
  const text = paluwaganReminder({ memberName: "Ate Joy", groupName: "Opisina", round: 3, contribution: 1000, dueOn: "2026-12-01", currency: "PHP" });
  expect(text).toMatch(/^Hi Ate Joy!/);
  expect(text).toContain('"Opisina"');
  expect(text).toContain("round 3");
  expect(text).toContain("₱1,000");
});

test("greetingName keeps the honorific with the name", () => {
  expect(greetingName("Tita Baby Cruz")).toBe("Tita Baby");
  expect(greetingName("Kuya Ben")).toBe("Kuya Ben");
  expect(greetingName("Joy Santos")).toBe("Joy");
  expect(greetingName("Lola")).toBe("Lola");
});
