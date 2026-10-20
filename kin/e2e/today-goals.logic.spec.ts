import { test, expect } from "@playwright/test";
import { goalsCookieName, goalsSummary, progressText, splitDone, startsOpen } from "@/lib/today-goals";

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
