import { test, expect } from "@playwright/test";
import { cardFitsTrip, cardsForCheckout, scanValue, storeWords } from "@/lib/loyalty-cards";

/** Suki and loyalty cards at checkout: the shopping day's store picks the
 * cards; a day that names no store of theirs shows them all. */

const sm = { store: "SM Supermarket" };
const puregold = { store: "Puregold Price Club" };
const sr = { store: "S&R" };
const mercury = { store: "Mercury Drug" };
const suki = { store: "Aling Nena, palengke" };
const robinsons = { store: "Robinson's Supermarket" };
const cards = [sm, puregold, sr, mercury, suki, robinsons];

test("store words drop accents and keep S&R and Robinson's whole", () => {
  expect(storeWords("S&R Membership")).toEqual(["sr", "membership"]);
  expect(storeWords("Robinson’s")).toEqual(["robinsons"]);
  expect(storeWords("Palengke sa Parañaque")).toEqual(["palengke", "sa", "paranaque"]);
});

test("a trip names a store by its own name, whatever kind of place it says it is", () => {
  expect(cardFitsTrip("SM Supermarket", "SM run")).toBe(true);
  expect(cardFitsTrip("SM Supermarket", "SM Hypermarket")).toBe(true);
  expect(cardFitsTrip("Puregold Price Club", "Puregold")).toBe(true);
  expect(cardFitsTrip("S&R", "S&R trip")).toBe(true);
  expect(cardFitsTrip("Robinson's Supermarket", "Robinsons")).toBe(true);
  expect(cardFitsTrip("Aling Nena, palengke", "Palengke")).toBe(true);
  expect(cardFitsTrip("Mercury Drug", "Mercury Drug")).toBe(true);
});

test("a trip that names no store, or another store, fits nothing", () => {
  expect(cardFitsTrip("SM Supermarket", "Grocery run")).toBe(false);
  expect(cardFitsTrip("SM Supermarket", "Shopping")).toBe(false);
  expect(cardFitsTrip("SM Supermarket", "Puregold")).toBe(false);
  // "sm" is a word of its own, not part of "small".
  expect(cardFitsTrip("SM Supermarket", "Small errands")).toBe(false);
  expect(cardFitsTrip("Mercury Drug", "Pharmacy")).toBe(false);
});

test("at checkout the store's cards show, the rest one tap away", () => {
  const r = cardsForCheckout(cards, "SM run");
  expect(r.matched).toBe(true);
  expect(r.shown).toEqual([sm]);
  expect(r.others).toEqual([puregold, sr, mercury, suki, robinsons]);
});

test("no shopping day, or one that names no store of theirs, shows every card", () => {
  for (const title of [null, undefined, "", "Grocery run", "Landers"]) {
    const r = cardsForCheckout(cards, title);
    expect(r.matched).toBe(false);
    expect(r.shown).toEqual(cards);
    expect(r.others).toEqual([]);
  }
  expect(cardsForCheckout([], "SM run")).toEqual({ shown: [], others: [], matched: false });
});

test("the scanned value drops the spaces and dashes a number was copied with, and nothing else", () => {
  expect(scanValue(" 8000-1234 5678 ")).toBe("800012345678");
  expect(scanValue("SR-00123 A")).toBe("SR-00123 A");
});
