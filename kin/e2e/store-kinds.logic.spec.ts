import { test, expect } from "@playwright/test";
import {
  ANY_STORE,
  STORE_KINDS,
  cleanStoreName,
  groupByStoreKind,
  groupWithinStoreKind,
  guessStoreKind,
  storeKindOf,
  storeNameSuggestions,
} from "@/lib/grocery";

/** The list read one kind of store at a time (23 October, Janine): Market is
 * the palengke, Grocery the supermarket, and a line can name its store. */

test("a line with no store is guessed from its section, a medicine at the pharmacy", () => {
  expect(guessStoreKind("Produce")).toBe("market");
  expect(guessStoreKind("Fish & Seafood")).toBe("market");
  expect(guessStoreKind("Personal Care")).toBe("pharmacy");
  expect(guessStoreKind("Baby")).toBe("baby");
  expect(guessStoreKind("Pet")).toBe("pet");
  expect(guessStoreKind("Rice & Grains")).toBe("grocery");
  expect(guessStoreKind("Other", "med-1")).toBe("pharmacy");
  expect(storeKindOf({ section: "Produce", store_kind: "grocery" })).toBe("grocery");
  expect(storeKindOf({ section: "Produce", store_kind: "nonsense" })).toBe("market");
});

test("store names are tidied, and blank is none", () => {
  expect(cleanStoreName("  Mercury   Drug ")).toBe("Mercury Drug");
  expect(cleanStoreName("   ")).toBeNull();
  expect(cleanStoreName(null)).toBeNull();
  expect(cleanStoreName("x".repeat(90))).toHaveLength(80);
});

test("All items: one group per kind of store in picker order, empty kinds left out", () => {
  const groups = groupByStoreKind([
    { name: "Dog food", section: "Pet" },
    { name: "Rice", section: "Rice & Grains" },
    { name: "Tomatoes", section: "Produce" },
    { name: "Notebook", section: "Other", store_kind: "bookstore" },
  ]);
  expect(groups.map((g) => g.name)).toEqual(["Market", "Grocery", "Bookstore", "Pet shop"]);
  expect(STORE_KINDS.indexOf("market")).toBe(0);
});

test("one kind: named stores A to Z, then Any store; no names walks the market by aisle", () => {
  const items = [
    { name: "Paracetamol", section: "Other", store_kind: "pharmacy", store_name: "Watsons" },
    { name: "Vitamins", section: "Other", store_kind: "pharmacy", store_name: "mercury drug" },
    { name: "Losartan", section: "Other", store_kind: "pharmacy", store_name: "Mercury Drug" },
    { name: "Cotton", section: "Personal Care" },
    { name: "Rice", section: "Rice & Grains" },
  ];
  const pharmacy = groupWithinStoreKind("pharmacy", items);
  expect(pharmacy.map((g) => [g.name, g.items.length])).toEqual([
    ["mercury drug", 2],
    ["Watsons", 1],
    [ANY_STORE, 1],
  ]);
  const market = groupWithinStoreKind("market", [
    { name: "Pork", section: "Meat" },
    { name: "Kangkong", section: "Produce" },
  ]);
  expect(market.map((g) => g.name)).toEqual(["Produce", "Meat"]);
  expect(groupWithinStoreKind("gadgets", [{ name: "Charger", section: "Other", store_kind: "gadgets" }]).map((g) => g.name)).toEqual(["Gadgets shop"]);
  expect(groupWithinStoreKind("bookstore", items)).toEqual([]);
});

test("store suggestions: this kind's first, then the household's others, then its cards, each once", () => {
  const used = [
    { store_kind: "grocery", store_name: "Puregold" },
    { store_kind: "pharmacy", store_name: "Watsons" },
    { store_kind: "pharmacy", store_name: "watsons" },
  ];
  expect(storeNameSuggestions(used, ["SM Supermarket", "Puregold"], "pharmacy")).toEqual(["Watsons", "Puregold", "SM Supermarket"]);
});
