import { test, expect } from "@playwright/test";
import { NOCHE_BUENA_DISHES, christmasCountdown, dishesLine, giftListLine, isChristmasSeason, nocheBuenaDate, nocheBuenaDishes, nocheBuenaToAdd } from "@/lib/christmas";
import { MARKET_SECTIONS } from "@/lib/grocery";
import { RECIPES_BY_KEY } from "@/lib/recipes";

/** Christmas on Today (20261020212000_christmas_on_today.sql): the season's
 * dates in the household's own day, what the countdown says, the ready
 * Noche Buena plan and what adding it twice does. */

test("the season is 1 December through 1 January, off on 2 January", () => {
  expect(isChristmasSeason("2026-11-30")).toBe(false);
  expect(isChristmasSeason("2026-12-01")).toBe(true);
  expect(isChristmasSeason("2026-12-25")).toBe(true);
  expect(isChristmasSeason("2026-12-31")).toBe(true);
  expect(isChristmasSeason("2027-01-01")).toBe(true);
  expect(isChristmasSeason("2027-01-02")).toBe(false);
  expect(isChristmasSeason("2027-06-15")).toBe(false);
});

test("Noche Buena is 24 December of the season's year, also on 1 January", () => {
  expect(nocheBuenaDate("2026-12-01")).toBe("2026-12-24");
  expect(nocheBuenaDate("2026-12-31")).toBe("2026-12-24");
  expect(nocheBuenaDate("2027-01-01")).toBe("2026-12-24");
});

test("the countdown, day by day", () => {
  expect(christmasCountdown("2026-11-30")).toBeNull();
  expect(christmasCountdown("2026-12-01")?.title).toBe("23 sleeps to Noche Buena");
  expect(christmasCountdown("2026-12-23")?.title).toBe("1 sleep to Noche Buena");
  expect(christmasCountdown("2026-12-24")?.title).toBe("Noche Buena tonight!");
  expect(christmasCountdown("2026-12-25")?.title).toBe("Maligayang Pasko!");
  expect(christmasCountdown("2026-12-26")?.title).toBe("5 sleeps to Media Noche");
  expect(christmasCountdown("2026-12-31")?.title).toBe("Media Noche tonight!");
  expect(christmasCountdown("2027-01-01")?.title).toBe("Manigong Bagong Taon!");
  expect(christmasCountdown("2027-01-02")).toBeNull();
});

test("every Noche Buena dish is a recipe in the library, with ingredients in real market sections", () => {
  const dishes = nocheBuenaDishes();
  expect(dishes.map((d) => d.key)).toEqual([...NOCHE_BUENA_DISHES]);
  for (const key of NOCHE_BUENA_DISHES) {
    const r = RECIPES_BY_KEY.get(key);
    expect(r, key).toBeTruthy();
    expect(r!.slots).toContain("dinner");
    expect(r!.ingredients.length).toBeGreaterThan(0);
    for (const i of r!.ingredients) expect(MARKET_SECTIONS as readonly string[]).toContain(i.section);
  }
  expect(dishes.find((d) => d.key === "hamon")?.name).toBe("Hamon (Christmas ham)");
});

test("planning twice adds nothing twice; a dish typed by hand with the same name counts as planned", () => {
  expect(nocheBuenaToAdd(["hamon", "spaghetti", "fruit-salad"], [])).toEqual(["hamon", "spaghetti", "fruit-salad"]);
  expect(nocheBuenaToAdd(["hamon", "spaghetti"], [{ recipe_key: "hamon", dish: "Hamon (Christmas ham)" }])).toEqual(["spaghetti"]);
  expect(nocheBuenaToAdd(["spaghetti"], [{ recipe_key: null, dish: "filipino spaghetti " }])).toEqual([]);
  expect(nocheBuenaToAdd(["not-a-recipe", "hamon"], [])).toEqual(["hamon"]);
});

test("the lines on the cards", () => {
  expect(dishesLine([])).toBe("Nothing planned yet");
  expect(dishesLine(["Hamon", "Queso de bola"])).toBe("Hamon, Queso de bola");
  expect(dishesLine(["Hamon", "Queso de bola", "Spaghetti", "Fruit salad", "Lumpia"])).toBe("Hamon, Queso de bola and 3 more");
  const money = (n: number) => `₱${n}`;
  expect(giftListLine({ people: 0, done: 0, bought: 0, budget: 0 }, money)).toBe("A budget for each person and inaanak, ticked when bought");
  expect(giftListLine({ people: 5, done: 3, bought: 4500, budget: 6000 }, money)).toBe("3 of 5 done · ₱4500 of ₱6000");
  expect(giftListLine({ people: 2, done: 0, bought: 500, budget: 0 }, money)).toBe("0 of 2 done · ₱500 bought");
});
