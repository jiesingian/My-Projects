import { test, expect } from "@playwright/test";
import { shopGlance } from "@/lib/shop-glance";

/** Today's one mention of the shopping list (Janine, 21 October): the At a
 * glance tile. */

const peso = (n: number) => `₱${n.toFixed(2)}`;

test("what is on the list and about what it costs", () => {
  expect(shopGlance({ open: ["Rice", "Eggs"], estimate: 650, unpriced: 0, low: 0 }, peso)).toEqual({ value: "2 to buy", label: "about ₱650.00" });
  expect(shopGlance({ open: ["Rice", "Eggs"], estimate: 650, unpriced: 1, low: 0 }, peso).label).toBe("about ₱650.00 + unpriced");
});

test("no prices yet: the first three names", () => {
  expect(shopGlance({ open: ["Rice", "Eggs", "Milk", "Bread"], estimate: 0, unpriced: 4, low: 0 }, peso).label).toBe("Rice, Eggs, Milk");
});

test("running low joins the tile instead of a card of its own", () => {
  expect(shopGlance({ open: ["Rice"], estimate: 60, unpriced: 0, low: 3 }, peso)).toEqual({ value: "1 to buy", label: "about ₱60.00 · 3 running low" });
});

test("an empty list says so, unless something is running low", () => {
  expect(shopGlance({ open: [], estimate: 0, unpriced: 0, low: 0 }, peso)).toEqual({ value: "List clear", label: "shopping list is empty" });
  expect(shopGlance({ open: [], estimate: 0, unpriced: 0, low: 2 }, peso)).toEqual({ value: "2 running low", label: "not on the list yet" });
});
