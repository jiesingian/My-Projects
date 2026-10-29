import { test, expect } from "@playwright/test";
import { openSchoolToday, type SchoolRoutine } from "@/lib/school";

/** "No classes today" (lib/school): which school routines fall today and are still open. */

const r = (id: string, over: Partial<SchoolRoutine> = {}): SchoolRoutine => ({ id, title: id, kind: "school", freq: "weekly", repeat_interval: 1, byweekday: [1, 2, 3, 4, 5], bymonthday: null, start_date: "2026-08-01", end_date: null, ...over });

test("a weekday's class days and pickups are open until someone marks them", () => {
  // Thursday 29 October 2026.
  const day = "2026-10-29";
  expect(openSchoolToday([r("Class"), r("School pickup")], new Set(), day).map((x) => x.id)).toEqual(["Class", "School pickup"]);
  expect(openSchoolToday([r("Class"), r("School pickup")], new Set(["Class"]), day).map((x) => x.id)).toEqual(["School pickup"]);
});

test("weekends, other kinds, ended and not-yet-started routines are left alone", () => {
  expect(openSchoolToday([r("Class")], new Set(), "2026-10-31")).toEqual([]);
  expect(openSchoolToday([r("Gym", { kind: "fitness" })], new Set(), "2026-10-29")).toEqual([]);
  expect(openSchoolToday([r("Old", { end_date: "2026-10-01" }), r("New", { start_date: "2026-11-02" })], new Set(), "2026-10-29")).toEqual([]);
});
