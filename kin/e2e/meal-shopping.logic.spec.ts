import { test, expect } from "@playwright/test";
import { planAdd, planRemove, lineKey, mealDayLabel, type MealIngredientRow } from "@/lib/meal-shopping";

/** Picking meals writes the shopping list: missing ingredients only, merged
 * by item and unit, each line knowing which meals it is for; removing a meal
 * takes back only its own share. */

const ing = (name: string, qty: number | null, unit: string | null): MealIngredientRow => ({
  ingredient_name: name,
  item_key: name.toLowerCase(),
  qty: qty == null ? null : `${qty} ${unit}`,
  qty_amount: qty,
  unit,
  section: null,
});

const adobo = { id: "m1", ingredients: [ing("Chicken thigh", 1, "kg"), ing("Garlic", 0.1, "kg"), ing("Soy sauce", 0.5, "bottle"), ing("Salt", 1, "pack")] };
const tinola = { id: "m2", ingredients: [ing("Chicken whole", 1, "kg"), ing("Garlic", 0.05, "kg"), ing("Ginger", 0.05, "kg")] };

test("two meals on an empty list: one line per item and unit, amounts added, both meals on the shared line", () => {
  const plan = planAdd([adobo, tinola], [], [], new Set());
  const garlic = plan.create.find((c) => c.name === "Garlic")!;
  expect(garlic.quantity).toBe(0.15);
  expect(garlic.meals).toEqual([
    { mealId: "m1", quantity: 0.1 },
    { mealId: "m2", quantity: 0.05 },
  ]);
  expect(plan.create.map((c) => c.name).sort()).toEqual(["Chicken thigh", "Chicken whole", "Garlic", "Ginger", "Soy sauce"]);
  expect(plan.grow).toEqual([]);
});

test("what is in the pantry is not bought, and staples are never added", () => {
  const plan = planAdd([adobo], [], [], new Set(["soy sauce"]));
  expect(plan.create.map((c) => c.name).sort()).toEqual(["Chicken thigh", "Garlic"]);
});

test("a second meal grows the line the first one made, and links itself to it", () => {
  const open = [{ id: "b1", name: "Garlic", quantity: 0.1, unit: "kg", source: "meal_plan" }];
  const links = [{ buy_item_id: "b1", meal_plan_id: "m1", quantity: 0.1 }];
  const plan = planAdd([tinola], open, links, new Set());
  expect(plan.grow).toEqual([{ id: "b1", quantity: 0.15 }]);
  expect(plan.links).toEqual([{ buy_item_id: "b1", meal_plan_id: "m2", quantity: 0.05 }]);
  expect(plan.create.find((c) => c.name === "Garlic")).toBeUndefined();
});

test("a different unit is a different line", () => {
  const open = [{ id: "b1", name: "Garlic", quantity: 1, unit: "pc", source: "meal_plan" }];
  const plan = planAdd([adobo], open, [], new Set());
  expect(plan.grow).toEqual([]);
  expect(plan.create.find((c) => c.name === "Garlic")?.unit).toBe("kg");
});

test("running it again for the same meal adds nothing", () => {
  const open = [
    { id: "b1", name: "Chicken thigh", quantity: 1, unit: "kg", source: "meal_plan" },
    { id: "b2", name: "Garlic", quantity: 0.1, unit: "kg", source: "meal_plan" },
    { id: "b3", name: "Soy sauce", quantity: 0.5, unit: "bottle", source: "meal_plan" },
  ];
  const links = open.map((o) => ({ buy_item_id: o.id, meal_plan_id: "m1", quantity: o.quantity }));
  expect(planAdd([adobo], open, links, new Set())).toEqual({ grow: [], create: [], links: [] });
});

test("something written on the list by hand is left as the household wrote it", () => {
  const open = [{ id: "h1", name: "garlic", quantity: 1, unit: "kg", source: "house" }];
  const plan = planAdd([adobo], open, [], new Set());
  expect(plan.grow).toEqual([]);
  expect(plan.create.find((c) => lineKey(c.name, c.unit) === lineKey("Garlic", "kg"))).toBeUndefined();
});

test("removing a meal: its own lines go, shared lines shrink by its share, the basket is left alone", () => {
  const base = { source: "meal_plan", checked: false, cleared: false };
  const { remove, shrink } = planRemove([
    { ...base, id: "only", quantity: 1, share: 1, others: 0 },
    { ...base, id: "shared", quantity: 0.15, share: 0.1, others: 1 },
    { ...base, id: "ticked", quantity: 1, share: 1, others: 0, checked: true },
    { ...base, id: "hand", quantity: 1, share: null, others: 0, source: "house" },
  ]);
  expect(remove).toEqual(["only"]);
  expect(shrink).toEqual([{ id: "shared", quantity: 0.05 }]);
});

test("the label's day", () => {
  expect(mealDayLabel("2026-10-07")).toBe("Wed");
  expect(mealDayLabel("not a date")).toBe("");
});
