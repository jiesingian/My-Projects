import { test, expect } from "@playwright/test";
import { ingredientCost, mealCost } from "@/lib/meal-cost";

/** A meal's cost from the price book: only amounts whose unit can honestly
 * become the book's are priced. */

const none = new Map<string, { unit_price: number; unit: string }>();

test("the same unit, and grams to kilos, are priced", () => {
  // Pork belly is ₱380 a kg in the starter book.
  expect(ingredientCost("Pork belly", 0.5, "kg", none)).toBe(190);
  expect(ingredientCost("Pork belly", 250, "g", none)).toBe(95);
});

test("cups and spoons become litres; a pack price is never guessed", () => {
  const mine = new Map([["fresh milk", { unit_price: 100, unit: "L" }]]);
  expect(ingredientCost("Fresh milk", 2, "Cups", mine)).toBeCloseTo(48);
  // Oatmeal is priced per pack: 5 tbsp of it is not priced.
  expect(ingredientCost("Oatmeal", 5, "Tbsp", none)).toBeNull();
  expect(ingredientCost("Something Kin has never heard of", 1, "kg", none)).toBeNull();
});

test("a meal adds what it can price, counts what it cannot, skips staples", () => {
  const cost = mealCost(
    [
      { name: "Pork belly", amount: 0.5, unit: "kg" },
      { name: "Oatmeal", amount: 5, unit: "Tbsp" },
      { name: "Salt", amount: 1, unit: "tsp" },
    ],
    none,
  );
  expect(cost).toEqual({ total: 190, priced: 1, unpriced: 1 });
});
