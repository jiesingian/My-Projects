import { test, expect } from "@playwright/test";
import { QUICK_ACTIONS, gestureFor, quickPath, readQuickPrefs, QUICK_DEFAULTS } from "../src/lib/quick-button";

/** The phone's quick button: three fixed links whose destinations come from
 * the member's saved choice. These are the rules that keep a bad or old saved
 * value from sending anyone anywhere but one of Kin's own pages. */

test("an empty or broken setting falls back to the defaults", () => {
  expect(readQuickPrefs({})).toEqual(QUICK_DEFAULTS);
  expect(readQuickPrefs(null)).toEqual(QUICK_DEFAULTS);
  expect(readQuickPrefs([1, 2])).toEqual(QUICK_DEFAULTS);
  expect(readQuickPrefs({ button: "nokia", tap: "https://evil.example", double: "buy" })).toEqual({ ...QUICK_DEFAULTS, double: "buy" });
});

test("the defaults are open, chat with Kin, talk to Kin", () => {
  const p = readQuickPrefs({});
  expect(quickPath(p, "tap", false)).toBe("/today");
  expect(quickPath(p, "double", false)).toBe("/today?kin=chat");
  expect(quickPath(p, "hold", false)).toBe("/today?kin=voice");
});

test("every destination is one of Kin's own paths", () => {
  for (const a of QUICK_ACTIONS) expect(a.path).toMatch(/^\/[a-z]/);
});

test("kid view only gets what kid view shows", () => {
  const p = readQuickPrefs({ tap: "expense", double: "family-chat", hold: "talk" });
  expect(quickPath(p, "tap", true)).toBe("/today");
  expect(quickPath(p, "double", true)).toBe("/chat");
  expect(quickPath(p, "hold", true)).toBe("/today");
  expect(quickPath(p, "tap", false)).toBe("/wealth/transact?mode=out");
});

test("Back Tap alone has two gestures, the Action Button pairing has three", () => {
  expect(["tap", "double", "hold"].map((s) => gestureFor("action", s as "tap"))).toEqual(["Action Button", "Back Tap · Double Tap", "Back Tap · Triple Tap"]);
  expect(gestureFor("backtap", "hold")).toBeNull();
  expect(gestureFor("backtap", "tap")).toBe("Back Tap · Double Tap");
});
