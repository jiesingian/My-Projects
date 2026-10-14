import { test, expect } from "@playwright/test";
import { readSpokenList, addedSentence, joinSpoken, shortcutText, LIST_ADD_MAX_ITEMS } from "@/lib/list-add";

/** "Hey Siri, add rice to Kin" (14 October): what the Shortcut heard, read
 * into shopping-list items, and what the iPhone says back. */

const names = (s: string) => readSpokenList(s).items.map((i) => i.name);

test("commas, and, and the Filipino at split the things", () => {
  expect(names("rice 2kg, eggs at milk")).toEqual(["Rice", "Eggs", "Milk"]);
  expect(names("Rice and eggs.")).toEqual(["Rice", "Eggs"]);
  expect(names("sibuyas saka bawang tsaka kamatis")).toEqual(["Sibuyas", "Bawang", "Kamatis"]);
  expect(names("bread; butter & jam")).toEqual(["Bread", "Butter", "Jam"]);
  // A shop's name or a brand with "&" in it stays one thing.
  expect(names("S&R hotdogs, M&M's")).toEqual(["S&R hotdogs", "M&M's"]);
});

test("quantities and units are read the way one-line add reads them", () => {
  const [rice, eggs] = readSpokenList("rice 2kg, 12 eggs").items;
  expect(rice).toEqual({ name: "Rice", quantity: 2, unit: "kg", section: "Rice & Grains" });
  expect(eggs).toMatchObject({ name: "Eggs", quantity: 12, unit: null });
  expect(readSpokenList("2 kilos of rice").items[0]).toMatchObject({ name: "Rice", quantity: 2, unit: "kg" });
  expect(readSpokenList("two dozen eggs").items[0]).toMatchObject({ name: "Eggs", quantity: 2, unit: "dozen" });
  expect(readSpokenList("a kilo of pork").items[0]).toMatchObject({ name: "Pork", quantity: 1, unit: "kg" });
  expect(readSpokenList("a banana").items[0]).toMatchObject({ name: "Banana", quantity: null, unit: null });
});

test("the asking is not part of the thing", () => {
  expect(names("Add rice and eggs to the list")).toEqual(["Rice", "Eggs"]);
  expect(names("we need toothpaste")).toEqual(["Toothpaste"]);
  expect(names("pabili ng suka at toyo")).toEqual(["Suka", "Toyo"]);
  expect(names("please add milk to Kin")).toEqual(["Milk"]);
  expect(names("we're out of coffee")).toEqual(["Coffee"]);
});

test("each thing lands in its market section", () => {
  const items = readSpokenList("chicken, shampoo").items;
  expect(items.map((i) => i.section)).toEqual(["Meat", "Personal Care"]);
});

test("what the database would drop is not said back either", () => {
  expect(readSpokenList("0 eggs").items[0]).toMatchObject({ name: "Eggs", quantity: null, unit: null });
  expect(readSpokenList("rice 20000kg").items[0]).toMatchObject({ name: "Rice", quantity: null, unit: null });
  // Cut at 150 characters, never through the middle of an emoji.
  const long = readSpokenList("x".repeat(149) + "🍚").items[0].name;
  expect(Array.from(long)).toHaveLength(150);
  expect(() => JSON.parse(JSON.stringify(long))).not.toThrow();
  expect(long.endsWith("🍚")).toBe(true);
});

test("the same thing twice is added once, and nothing said adds nothing", () => {
  expect(names("rice, Rice and rice")).toEqual(["Rice"]);
  expect(readSpokenList("").items).toEqual([]);
  expect(readSpokenList(" , and . ").items).toEqual([]);
  expect(readSpokenList("add to the list").items).toEqual([]);
});

test("at most twenty at once, with the rest counted", () => {
  const said = Array.from({ length: 23 }, (_, i) => `thing ${String.fromCharCode(97 + i)}`).join(", ");
  const { items, extra } = readSpokenList(said);
  expect(items).toHaveLength(LIST_ADD_MAX_ITEMS);
  expect(extra).toBe(3);
});

test("what the iPhone says back", () => {
  expect(joinSpoken(["rice"])).toBe("rice");
  expect(joinSpoken(["rice", "eggs"])).toBe("rice and eggs");
  expect(joinSpoken(["rice", "eggs", "milk"])).toBe("rice, eggs and milk");
  const { items } = readSpokenList("rice and eggs");
  expect(addedSentence(items, 2, 0)).toBe("Added rice and eggs to the list.");
  const two = readSpokenList("rice 2kg, 3 eggs").items;
  expect(addedSentence(two, 2, 0)).toBe("Added 2 kilos of rice and 3 eggs to the list.");
  expect(addedSentence(readSpokenList("a dozen eggs, 1 pack of noodles, 3 pieces of soap").items, 3, 0)).toBe(
    "Added 1 dozen eggs, 1 pack of noodles and 3 pieces of soap to the list.",
  );
  expect(addedSentence(items, 1, 0)).toBe("Added 1 thing to the list.");
  expect(addedSentence(items, 2, 1)).toContain("1 more wasn't added. Say it again.");
  expect(addedSentence(items, 0, 0)).toContain("couldn't add");
  expect(addedSentence(readSpokenList("SM bags").items, 1, 0)).toBe("Added SM bags to the list.");
});

test("the words arrive as JSON, a form or plain text", () => {
  expect(shortcutText('{"text":"rice and eggs"}', "application/json")).toBe("rice and eggs");
  expect(shortcutText('{"Dictated Text":"milk"}', "application/json; charset=utf-8")).toBe("milk");
  expect(shortcutText('"milk"', "application/json")).toBe("milk");
  expect(shortcutText("{not json", "application/json")).toBe("");
  expect(shortcutText("[1,2]", "application/json")).toBe("");
  expect(shortcutText("text=rice+and+eggs", "application/x-www-form-urlencoded")).toBe("rice and eggs");
  expect(shortcutText("rice and eggs", "text/plain")).toBe("rice and eggs");
  expect(shortcutText("rice", null)).toBe("rice");
});
