import { test, expect } from "@playwright/test";
import { listTotals, parseGiftIdea, personTotals, spendParticulars, type GiftPerson } from "@/lib/gift-list";

/** Christmas gifts and aguinaldo (20261019170300_gift_list.sql): what the
 * list adds up to, and what the Wealth entry says. */

const mia: GiftPerson = {
  id: "mia",
  name: "Mia",
  kind: "family",
  budget: 1500,
  items: [
    { id: "1", label: "Lego set", cost: 1200, isCash: false, bought: true },
    { id: "2", label: "Socks", cost: 450, isCash: false, bought: false },
  ],
};
const josh: GiftPerson = { id: "josh", name: "Joshua", kind: "inaanak", budget: 500, items: [{ id: "3", label: "Aguinaldo", cost: 500, isCash: true, bought: true }] };
const lola: GiftPerson = { id: "lola", name: "Lola", kind: "family", budget: null, items: [{ id: "4", label: "Shawl", cost: null, isCash: false, bought: false }] };

test("a person: planned, bought, what is left of the budget, over, done", () => {
  expect(personTotals(mia)).toEqual({ planned: 1650, bought: 1200, left: -150, over: true, done: false });
  expect(personTotals(josh)).toEqual({ planned: 500, bought: 500, left: 0, over: false, done: true });
  expect(personTotals(lola)).toEqual({ planned: 0, bought: 0, left: null, over: false, done: false });
  expect(personTotals({ budget: 100, items: [] }).done).toBe(false);
});

test("the year: budgets, planned, bought, people done, aguinaldo set aside", () => {
  expect(listTotals([mia, josh, lola])).toEqual({ budget: 2000, planned: 2150, bought: 1700, people: 3, done: 1, aguinaldo: 500 });
});

test("one box: the idea, its cost, and whether it is cash", () => {
  expect(parseGiftIdea("Lego set 1,200")).toEqual({ label: "Lego set", cost: 1200, isCash: false });
  expect(parseGiftIdea("Polo shirt ₱799.50")).toEqual({ label: "Polo shirt", cost: 799.5, isCash: false });
  expect(parseGiftIdea("Aguinaldo 500")).toEqual({ label: "Aguinaldo", cost: 500, isCash: true });
  expect(parseGiftIdea("₱200 cash")).toEqual({ label: "cash", cost: 200, isCash: true });
  expect(parseGiftIdea("Book: any mystery")).toEqual({ label: "Book: any mystery", cost: null, isCash: false });
  expect(parseGiftIdea("iPhone 15")).toEqual({ label: "iPhone 15", cost: null, isCash: false });
  expect(parseGiftIdea("Ref magnet ₱35")).toEqual({ label: "Ref magnet", cost: 35, isCash: false });
  expect(parseGiftIdea("   ")).toBeNull();
});

test("the Wealth entry never names who it is for", () => {
  expect(spendParticulars({ isCash: false })).toBe("Christmas gift");
  expect(spendParticulars({ isCash: true })).toBe("Aguinaldo");
});
