import { test, expect } from "@playwright/test";
import { claimLimit, parsePotluckItem, potluckLines, potluckSummary } from "@/lib/potluck";

/** Potluck on an event (20261019140000_event_potluck.sql): what the event
 * screen shows of who brings what. The database keeps the same limits
 * (potluck_claims_fill); the PGlite probe holds it to them. */

const me = { id: "ann", familyId: "A" };
const items = [
  { id: "ice", label: "Ice", wanted: 3, position: 1 },
  { id: "pancit", label: "Pancit", wanted: 2, position: 0 },
  { id: "rice", label: "Rice", wanted: 1, position: 2 },
];
const claims = [
  { id: "c1", item_id: "pancit", member_id: "ann", member_name: "Ann Reyes", household_name: "Reyes", family_id: "A", qty: 1 },
  { id: "c2", item_id: "pancit", member_id: "ben", member_name: "Ben Cruz", household_name: "Cruz", family_id: "B", qty: 1 },
  { id: "c3", item_id: "ice", member_id: "kid", member_name: "Mia Reyes", household_name: "Reyes", family_id: "A", qty: 2 },
];

test("the list keeps the host's order and counts what is left", () => {
  const lines = potluckLines(items, claims, me);
  expect(lines.map((l) => [l.label, l.taken, l.left])).toEqual([
    ["Pancit", 2, 0],
    ["Ice", 2, 1],
    ["Rice", 0, 1],
  ]);
});

test("bringers: You for the viewer, first names, and the household only when it isn't ours", () => {
  const [pancit, ice] = potluckLines(items, claims, me);
  expect(pancit.bringers.map((b) => b.name)).toEqual(["You", "Ben · Cruz"]);
  expect(ice.bringers.map((b) => b.name)).toEqual(["Mia"]);
  expect(pancit.mine).toEqual({ id: "c1", qty: 1 });
});

test("a claim may grow into what is left, counting what the viewer holds", () => {
  const [pancit, ice, rice] = potluckLines(items, claims, me);
  expect(claimLimit(pancit)).toBe(1);
  expect(claimLimit(ice)).toBe(1);
  expect(claimLimit(rice)).toBe(1);
});

test("the summary counts items fully covered", () => {
  expect(potluckSummary([])).toBe("Nothing listed yet");
  expect(potluckSummary(potluckLines(items, claims, me))).toBe("1 of 3 covered");
  expect(potluckSummary(potluckLines(items.slice(1, 2), claims, me))).toBe("Everything is covered");
});

test("one box: the label and how many", () => {
  expect(parsePotluckItem("Pancit x2")).toEqual({ label: "Pancit", wanted: 2 });
  expect(parsePotluckItem("Ice ×3")).toEqual({ label: "Ice", wanted: 3 });
  expect(parsePotluckItem("2 Lumpia trays")).toEqual({ label: "Lumpia trays", wanted: 2 });
  expect(parsePotluckItem("  Leche flan ")).toEqual({ label: "Leche flan", wanted: 1 });
  expect(parsePotluckItem("Softdrinks x99")).toEqual({ label: "Softdrinks", wanted: 50 });
  expect(parsePotluckItem("Plates x0")).toEqual({ label: "Plates", wanted: 1 });
  expect(parsePotluckItem("   ")).toBeNull();
  expect(parsePotluckItem("x2")).toEqual({ label: "x2", wanted: 1 });
});
