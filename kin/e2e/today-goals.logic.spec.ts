import { test, expect } from "@playwright/test";
import { asksToday, childGoals, goalsCookieName, goalsSummary, progressText, splitDone, startsOpen } from "@/lib/today-goals";

/** Today's Goals, collapsible (Janine, 20 October). */

test("the header counts what is done, and cheers when everything is", () => {
  expect(goalsSummary(0, 3)).toBe("0 of 3 done");
  expect(goalsSummary(2, 3)).toBe("2 of 3 done");
  expect(goalsSummary(3, 3)).toBe("All done! 🎉");
});

test("done goals fold to the bottom, in the order they came", () => {
  const goals = [
    { id: "a", reached: true },
    { id: "b", reached: false },
    { id: "c", reached: true },
    { id: "d", reached: false },
  ];
  const { open, done } = splitDone(goals);
  expect(open.map((g) => g.id)).toEqual(["b", "d"]);
  expect(done.map((g) => g.id)).toEqual(["a", "c"]);
});

test("open by default; the member's saved choice wins", () => {
  expect(startsOpen(undefined, 1, 3)).toBe(true);
  expect(startsOpen("1", 1, 3)).toBe(true);
  expect(startsOpen("0", 1, 3)).toBe(false);
});

test("everything done: closed, whatever was saved", () => {
  expect(startsOpen("1", 3, 3)).toBe(false);
  expect(startsOpen(undefined, 3, 3)).toBe(false);
});

test("each member keeps their own choice on a shared device", () => {
  expect(goalsCookieName("m1")).not.toBe(goalsCookieName("m2"));
  expect(goalsCookieName("m1")).toMatch(/^kin_today_goals_/);
});

test("progress reads as done/target", () => {
  expect(progressText(5, 8)).toBe("5/8");
  expect(progressText(9000, 10000)).toBe("9,000/10,000");
  expect(progressText(72.44, 70)).toBe("72.4/70");
});

// --- A family's own plan (20261020210000) -----------------------------------------

const g = (over: Partial<{ ownerId: string | null; category: string | null; active: boolean; period: string; days: number[] | null; backup: boolean; id: string }>) => ({
  id: "g",
  ownerId: "keira",
  category: "reading",
  active: true,
  period: "day",
  days: null,
  backup: false,
  ...over,
});

test("weekday-only goals are not asked at the weekend; paused ones never", () => {
  expect(asksToday(g({ days: [1, 2, 3, 4, 5] }), "2026-10-21")).toBe(true); // Wednesday
  expect(asksToday(g({ days: [1, 2, 3, 4, 5] }), "2026-10-24")).toBe(false); // Saturday
  expect(asksToday(g({ active: false }), "2026-10-21")).toBe(false);
  expect(asksToday(g({ period: "week" }), "2026-10-24")).toBe(true);
});

test("parent-managed: each child with no login gets a group of their game goals, in order", () => {
  const goals = [
    g({ id: "book", ownerId: "keira" }),
    g({ id: "walk", ownerId: "keira", category: "outdoor" }),
    g({ id: "story", ownerId: "erynne", category: "sleep" }),
    g({ id: "old", ownerId: "keira", active: false }),
    g({ id: "plain", ownerId: "keira", category: null }),
    g({ id: "mine", ownerId: "janine" }),
  ];
  const groups = childGoals(goals, [{ id: "erynne", full_name: "Erynne S" }, { id: "keira", full_name: "Keira S" }, { id: "nobody", full_name: "N" }], "2026-10-21");
  expect(groups.map((x) => [x.child.id, x.goals.map((y) => y.id)])).toEqual([
    ["erynne", ["story"]],
    ["keira", ["book", "walk"]],
  ]);
});
