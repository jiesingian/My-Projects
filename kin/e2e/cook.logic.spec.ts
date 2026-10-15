import { test, expect } from "@playwright/test";
import { clampServings, findDurations, formatClock, formatDuration, roundForCooking, scaleFactor, scaleIngredient, toFraction } from "@/lib/cook";
import { RECIPES } from "@/lib/recipes";

/** Cook mode and servings: scaling a recipe to the people at the table,
 * rounding the way a cook measures, and finding the timers in a step. */

test("the scale factor is servings over the recipe's own, and a broken serves leaves it alone", () => {
  expect(scaleFactor(4, 8)).toBe(2);
  expect(scaleFactor(5, 2)).toBeCloseTo(0.4);
  expect(scaleFactor(0, 4)).toBe(1);
  expect(scaleFactor(Number.NaN, 4)).toBe(1);
});

test("fractions are the ones a cook measures with, and never round to nothing", () => {
  expect(toFraction(0.5).text).toBe("½");
  expect(toFraction(0.25).text).toBe("¼");
  expect(toFraction(0.3).text).toBe("⅓");
  expect(toFraction(0.7).text).toBe("⅔");
  expect(toFraction(1.5).text).toBe("1½");
  expect(toFraction(2).text).toBe("2");
  expect(toFraction(1.97).text).toBe("2");
  expect(toFraction(0.01).text).toBe("⅛");
  expect(toFraction(0.75).value).toBe(0.75);
});

test("cups and spoons get fractions; pieces and eggs round up; grams to whole numbers", () => {
  expect(roundForCooking(0.5, "cup").text).toBe("½");
  expect(roundForCooking(0.125, "tsp").text).toBe("⅛");
  expect(roundForCooking(1.6, "pc").text).toBe("2");
  expect(roundForCooking(3.0000000001, "pc").text).toBe("3");
  expect(roundForCooking(0.2, "pc").text).toBe("1");
  expect(roundForCooking(2.4, "", "Eggs").text).toBe("3");
  expect(roundForCooking(2.4, null, "Garlic").text).toBe("2.4");
  expect(roundForCooking(143, "g").text).toBe("145");
  expect(roundForCooking(12.4, "g").text).toBe("12");
  expect(roundForCooking(0.4, "mL").text).toBe("1");
  expect(roundForCooking(0.666666, "kg").text).toBe("0.67");
  expect(roundForCooking(0.6, "bottle").text).toBe("⅔");
});

test("an ingredient scales from the recipe's serves, keeps its unit, and a blank amount stays blank", () => {
  expect(scaleIngredient({ name: "Rice", qty: 1, unit: "cup" }, 4, 6)).toEqual({ qty: 1.5, text: "1½ cup" });
  expect(scaleIngredient({ name: "Eggs", qty: 2, unit: "pc" }, 4, 5)).toEqual({ qty: 3, text: "3 pc" });
  expect(scaleIngredient({ name: "Chicken", qty: 1, unit: "kg" }, 5, 8)).toEqual({ qty: 1.6, text: "1.6 kg" });
  expect(scaleIngredient({ name: "Salt", qty: null, unit: "to taste" }, 4, 8)).toEqual({ qty: null, text: "to taste" });
  // At its own servings the recipe reads exactly as written.
  expect(scaleIngredient({ name: "Vinegar", qty: 0.3, unit: "bottle" }, 5, 5)).toEqual({ qty: 0.3, text: "0.3 bottle" });
});

test("scaling a shipped recipe never produces a zero or a missing amount", () => {
  for (const r of RECIPES) {
    for (const servings of [1, 2, r.serves, 12]) {
      for (const ing of r.ingredients) {
        const s = scaleIngredient(ing, r.serves, servings);
        expect(s.qty, `${r.name}: ${ing.name} for ${servings}`).toBeGreaterThan(0);
        expect(s.text).not.toMatch(/NaN|undefined/);
      }
    }
  }
});

test("servings stay between 1 and 30", () => {
  expect(clampServings(0)).toBe(1);
  expect(clampServings(31)).toBe(30);
  expect(clampServings(4.4)).toBe(4);
  expect(clampServings(Number.NaN)).toBe(1);
});

test("a step's times become timers, in the order they are mentioned", () => {
  expect(findDurations("Simmer uncovered for 25 minutes until the sauce thickens.")).toEqual([{ seconds: 1500, label: "25 min" }]);
  expect(findDurations("Simmer the beef until tender, about an hour.")).toEqual([{ seconds: 3600, label: "1 hr" }]);
  expect(findDurations("Add shrimp last — three minutes is plenty.").map((d) => d.seconds)).toEqual([180]);
  expect(findDurations("Rest for half an hour.").map((d) => d.seconds)).toEqual([1800]);
  expect(findDurations("Bake 1½ hours.").map((d) => d.seconds)).toEqual([5400]);
  expect(findDurations("Bake 1 and a half hours.").map((d) => d.seconds)).toEqual([5400]);
  expect(findDurations("Boil 1 hour 30 minutes.").map((d) => d.seconds)).toEqual([5400]);
  expect(findDurations("Fry 3-5 mins a side.").map((d) => d.seconds)).toEqual([180]);
  expect(findDurations("Marinate 30 minutes, then grill 10 min.").map((d) => d.seconds)).toEqual([1800, 600]);
  expect(findDurations("Microwave for 45 seconds.")).toEqual([{ seconds: 45, label: "45 sec" }]);
});

test("a step with no time in it has no timer", () => {
  expect(findDurations("Add kangkong last and turn off the heat.")).toEqual([]);
  expect(findDurations("Serve with 2 cups of rice.")).toEqual([]);
  expect(findDurations("Cut into 5-minute pieces")).toEqual([]);
});

test("timers read like a kitchen clock", () => {
  expect(formatDuration(5400)).toBe("1 hr 30 min");
  expect(formatDuration(90)).toBe("1 min 30 sec");
  expect(formatClock(1199.2)).toBe("20:00");
  expect(formatClock(65)).toBe("1:05");
  expect(formatClock(3725)).toBe("1:02:05");
  expect(formatClock(-3)).toBe("0:00");
});
