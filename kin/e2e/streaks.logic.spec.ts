import { test, expect } from "@playwright/test";
import { choreStreak, weekOf, type DayState } from "@/lib/streaks";

/** ISO dates from `start`, `n` days. */
function days(start: string, n: number): string[] {
  const d = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

function walk(states: DayState[], start = "2026-09-07" /* a Monday */, todayOpen = false) {
  const dates = days(start, states.length + (todayOpen ? 1 : 0));
  const map = new Map(dates.map((iso, i) => [iso, states[i] ?? "missed"] as const));
  return choreStreak(dates, (iso) => map.get(iso) ?? "missed", dates[dates.length - 1]);
}

test("weeks start on Monday", () => {
  expect(weekOf("2026-09-07")).toBe("2026-09-07");
  expect(weekOf("2026-09-13")).toBe("2026-09-07");
  expect(weekOf("2026-09-14")).toBe("2026-09-14");
});

test("seven done days in a row reach the first star", () => {
  const s = walk(Array(7).fill("done"));
  expect(s.days).toBe(7);
  expect(s.milestones).toEqual([{ date: "2026-09-13", reached: 7 }]);
  expect(s.nextStarAt).toBe(30);
});

test("today not yet ticked does not break the run", () => {
  const s = walk(Array(5).fill("done"), "2026-09-07", true);
  expect(s.days).toBe(5);
  expect(s.nextStarAt).toBe(7);
});

test("one miss a week is frozen; a second in the same week breaks the run", () => {
  const frozenOnce = walk(["done", "done", "missed", "done"]);
  expect(frozenOnce.days).toBe(3);
  expect(frozenOnce.freezeUsedThisWeek).toBe(true);

  const twice = walk(["done", "done", "missed", "done", "missed", "done"]);
  expect(twice.days).toBe(1);
});

test("a new week brings a new freeze", () => {
  // Mon..Sun with a miss on Wednesday, then the next Monday missed too.
  const s = walk(["done", "done", "missed", "done", "done", "done", "done", "missed", "done"]);
  expect(s.days).toBe(7);
  expect(s.freezeUsedThisWeek).toBe(true);
});

test("a miss with no run going is just a miss", () => {
  const s = walk(["missed", "done"]);
  expect(s.days).toBe(1);
  expect(s.freezeUsedThisWeek).toBe(false);
});

test("a chore waiting for a grown-up counts towards the run", () => {
  expect(walk(["done", "pending", "done"]).days).toBe(3);
});

test("thirty days earn both stars, and a rebuilt run earns them again", () => {
  const thirty = walk(Array(30).fill("done"));
  expect(thirty.milestones.map((m) => m.reached)).toEqual([7, 30]);
  expect(thirty.nextStarAt).toBeNull();

  const again = walk([...Array(7).fill("done"), "missed", "missed", ...Array(7).fill("done")]);
  expect(again.milestones.map((m) => m.reached)).toEqual([7, 7]);
});
