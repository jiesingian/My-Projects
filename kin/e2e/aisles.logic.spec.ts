import { test, expect } from "@playwright/test";
import { AISLES, MARKET_SECTIONS, aisleOf, groupByAisle } from "@/lib/grocery";

/** The shopping list by aisle: produce, meat, dairy, dry goods, household,
 * and Other last for whatever Kin could not file. */

test("every market section lands in one of the five aisles", () => {
  for (const section of MARKET_SECTIONS) expect(AISLES).toContain(aisleOf(section));
  expect(aisleOf("Fish & Seafood")).toBe("Meat");
  expect(aisleOf("Frozen")).toBe("Dairy");
  expect(aisleOf("Condiments & Spices")).toBe("Dry goods");
  expect(aisleOf("Personal Care")).toBe("Household");
  expect(aisleOf("Something new")).toBe("Other");
});

test("groups come in aisle order, only the ones with something in them, sections in market order inside", () => {
  const items = [
    { name: "Soap", section: "Household" },
    { name: "Rice", section: "Rice & Grains" },
    { name: "Bread", section: "Bakery" },
    { name: "Garlic", section: "Produce" },
    { name: "Bangus", section: "Fish & Seafood" },
    { name: "Pork", section: "Meat" },
    { name: "Onion", section: "Produce" },
  ];
  const groups = groupByAisle(items);
  expect(groups.map((g) => g.name)).toEqual(["Produce", "Meat", "Dry goods", "Household"]);
  expect(groups[0].items.map((i) => i.name)).toEqual(["Garlic", "Onion"]);
  expect(groups[1].items.map((i) => i.name)).toEqual(["Pork", "Bangus"]);
  expect(groups[2].items.map((i) => i.name)).toEqual(["Bread", "Rice"]);
});

test("an empty list has no aisles", () => {
  expect(groupByAisle([])).toEqual([]);
});
