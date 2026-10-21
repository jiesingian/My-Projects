import { test, expect } from "@playwright/test";
import { itemKey, keysFromMarks, splitDoneToday, weekRest } from "@/lib/week-done";

/** Planner → Calendar → Week (Janine, 21 October): past days leave the
 * list, and today's ticked items fold under "Done today". */

const day = (d: string, n: number, isSelected = false) => ({ day: d, isSelected, activities: Array.from({ length: n }) });

test("under the tapped day: today and later, with something on them -- no past day", () => {
  const days = [day("2026-10-19", 2), day("2026-10-20", 1), day("2026-10-21", 3), day("2026-10-22", 0), day("2026-10-23", 1, true), day("2026-10-24", 2)];
  expect(weekRest(days, "2026-10-21").map((d) => d.day)).toEqual(["2026-10-21", "2026-10-24"]);
});

test("a past day tapped on the rail is still shown in full (it is the selected one, not the rest)", () => {
  const days = [day("2026-10-19", 2, true), day("2026-10-21", 1)];
  expect(weekRest(days, "2026-10-21").map((d) => d.day)).toEqual(["2026-10-21"]);
});

test("an item is known across its repeats: a chore by its routine, a plan by its row", () => {
  expect(itemKey({ table: "routines", id: "r1:2026-10-21" })).toBe("routines:r1");
  expect(itemKey({ table: "activities", id: "a1:2026-10-21", sourceId: "a1" })).toBe("activities:a1");
  expect(itemKey({ table: "bills", id: "b1" })).toBe("bills:b1");
});

test("Today's marks become calendar keys; skipped ones and other kinds are left out", () => {
  expect(
    keysFromMarks([
      { item_key: "activity-a1", state: "done" },
      { item_key: "bill-b1", state: "done" },
      { item_key: "event-e1", state: "skipped" },
      { item_key: "health-h1", state: "done" },
    ]),
  ).toEqual(["activities:a1", "bills:b1"]);
});

test("today's items: still to do first, the done ones folded, each in its order", () => {
  const items = [
    { table: "routines", id: "r1:2026-10-21" },
    { table: "activities", id: "a1", sourceId: "a1" },
    { table: "routines", id: "r2:2026-10-21" },
  ];
  const { open, done } = splitDoneToday(items, new Set(["routines:r1", "activities:a1"]));
  expect(open.map((i) => i.id)).toEqual(["r2:2026-10-21"]);
  expect(done.map((i) => i.id)).toEqual(["r1:2026-10-21", "a1"]);
});
