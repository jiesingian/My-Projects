import { test, expect } from "@playwright/test";
import { amountWords, daysLeft, daysLeftWords, guessFromDose, needsRefill, onHand } from "@/lib/medicine-supply";

// Pills left and refill (20261014201000). Which doses count since the
// count (due after it, in the household's zone; unticked ones come back) is
// the database's medicine_on_hand(), run by
// supabase/tests/pglite/probes/medicine-supply.mjs.

test("on hand is the count less what was ticked since", () => {
  expect(onHand(30, 1, 4)).toBe(26);
  expect(onHand(30, 2, 4)).toBe(22);
  expect(onHand(60, 2.5, 4)).toBe(50); // ml
  // Ticks can outrun a count; it reads as run out, never as a negative.
  expect(onHand(3, 1, 5)).toBe(-2);
  expect(daysLeftWords(daysLeft(onHand(3, 1, 5), 1, 2))).toBe("Ran out");
});

test("days left at the medicine's schedule, partial days rounded down", () => {
  expect(daysLeft(13, 1, 2)).toBe(6.5);
  expect(daysLeftWords(daysLeft(13, 1, 2))).toBe("About 6 days left");
  expect(daysLeftWords(daysLeft(2, 1, 2))).toBe("About 1 day left");
  expect(daysLeftWords(daysLeft(1, 1, 2))).toBe("Runs out today");
  expect(daysLeftWords(daysLeft(0, 1, 2))).toBe("Ran out");
  // Two a dose, twice a day: 28 is 7 days.
  expect(daysLeft(28, 2, 2)).toBe(7);
  // 5 ml three times a day from 100 ml: 6.67 days.
  expect(daysLeftWords(daysLeft(100, 5, 3))).toBe("About 6 days left");
});

test("no schedule (as needed): no days left, never put on the list", () => {
  expect(daysLeft(10, 1, 0)).toBeNull();
  expect(daysLeftWords(null)).toBeNull();
  expect(needsRefill(null)).toBe(false);
});

test("seven days or fewer is when it goes on the list", () => {
  expect(needsRefill(7)).toBe(true);
  expect(needsRefill(7.5)).toBe(false);
  expect(needsRefill(0)).toBe(true);
});

test("amounts and the first guess from the dose as typed", () => {
  expect(amountWords(12, "tablet")).toBe("12 tablets");
  expect(amountWords(1, "capsule")).toBe("1 capsule");
  expect(amountWords(45.5, "ml")).toBe("45.5 ml");
  expect(amountWords(-3, "tablet")).toBe("0 tablets");
  expect(guessFromDose("5 ml")).toEqual({ unit: "ml", perDose: 5 });
  expect(guessFromDose("2 tablets")).toEqual({ unit: "tablet", perDose: 2 });
  expect(guessFromDose("1 cap")).toEqual({ unit: "capsule", perDose: 1 });
  expect(guessFromDose("500 mg, 2 tabs")).toEqual({ unit: "tablet", perDose: 2 });
  expect(guessFromDose("50 mg")).toEqual({ unit: "tablet", perDose: 1 });
  expect(guessFromDose(null)).toEqual({ unit: "tablet", perDose: 1 });
});
