import { test, expect } from "@playwright/test";
import { QUICK_ACTIONS, QUICK_DEFAULTS, cleanActions, goPath, readQuickPrefs } from "../src/lib/quick-button";

/** The Action Button's pop-up and the Home Screen widget: every item opens a
 * fixed /go/<action> link. These are the rules that keep a bad or old saved
 * value, or a made-up link, from sending anyone anywhere but Kin's own pages. */

test("an empty or broken setting falls back to the defaults", () => {
  expect(readQuickPrefs({})).toEqual(QUICK_DEFAULTS);
  expect(readQuickPrefs(null)).toEqual(QUICK_DEFAULTS);
  expect(readQuickPrefs([1, 2])).toEqual(QUICK_DEFAULTS);
  // The first version's shape reads as the defaults rather than failing.
  expect(readQuickPrefs({ button: "action", tap: "open", double: "ask", hold: "talk" })).toEqual(QUICK_DEFAULTS);
});

test("the default pop-up is open, chat with Kin, talk to Kin", () => {
  expect(QUICK_DEFAULTS.menu).toEqual(["open", "ask", "talk"]);
});

test("a picked list keeps Kin's order and drops duplicates and unknowns", () => {
  expect(cleanActions(["talk", "https://evil.example", "open", "talk"], 8)).toEqual(["open", "talk"]);
  expect(cleanActions([], 8)).toBeNull();
  expect(cleanActions("open", 8)).toBeNull();
  expect(cleanActions(QUICK_ACTIONS.map((a) => a.id), 4)).toBeNull();
});

test("every link lands on one of Kin's own paths", () => {
  expect(goPath("ask", false)).toBe("/today?kin=chat");
  expect(goPath("talk", false)).toBe("/today?kin=voice");
  expect(goPath("expense", false)).toBe("/wealth/transact?mode=out");
  expect(goPath("https:%2F%2Fevil.example", false)).toBe("/today");
  for (const a of QUICK_ACTIONS) expect(a.path).toMatch(/^\/[a-z]/);
});

test("the first version's press links still work", () => {
  expect(goPath("tap", false)).toBe("/today");
  expect(goPath("double", false)).toBe("/today?kin=chat");
  expect(goPath("hold", false)).toBe("/today?kin=voice");
});

test("kid view only gets what kid view shows", () => {
  expect(goPath("expense", true)).toBe("/today");
  expect(goPath("family-chat", true)).toBe("/chat");
  expect(goPath("talk", true)).toBe("/today");
});
