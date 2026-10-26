import { test, expect } from "@playwright/test";
import { splitToday, TODAY_SHOWN } from "@/lib/today-fold";
import { thisWeekTile } from "@/lib/this-week-tile";
import type { TodayEntry } from "@/components/today-list";

/** Today's list kept short (Jonathan, 26 October): the first five open
 * rows, "Show N more" for the rest, the answered ones folded into one line;
 * and the "This week" tile that took the Medicine tile's place. */

const item = (id: string, extra: Record<string, unknown> = {}) => ({ kind: "item", item: { id, title: id, ...extra } }) as unknown as TodayEntry;
const chore = (id: string, status: "done" | "skipped" | null) => ({ kind: "task", task: { id, title: id, today: { status } } }) as unknown as TodayEntry;
const dose = (id: string, next: string | null) => ({ kind: "dose", dose: { id, next } }) as unknown as TodayEntry;

test("the first five open rows show, in the server's order; the rest are counted", () => {
  const entries = ["a", "b", "c", "d", "e", "f", "g"].map((id) => item(id));
  const { open, more, done } = splitToday(entries);
  expect(TODAY_SHOWN).toBe(5);
  expect(open.map((e) => (e.kind === "item" ? e.item.id : ""))).toEqual(["a", "b", "c", "d", "e"]);
  expect(more).toBe(2);
  expect(done).toEqual([]);
});

test("answered rows fold away and never take one of the five places", () => {
  const entries = [chore("x", "done"), item("a"), dose("m", null), item("b", { mark: "skipped" }), item("c"), chore("y", null), dose("n", "08:00")];
  const { open, more, done } = splitToday(entries);
  expect(open).toHaveLength(4);
  expect(more).toBe(0);
  expect(done).toHaveLength(3);
});

test("Show more lifts the cap", () => {
  const entries = ["a", "b", "c", "d", "e", "f"].map((id) => item(id));
  expect(splitToday(entries, Infinity).open).toHaveLength(6);
  expect(splitToday(entries, Infinity).more).toBe(0);
});

test("This week counts what Coming up holds and opens it; a quiet week says so", () => {
  expect(thisWeekTile(7)).toMatchObject({ id: "week", value: "7 things", label: "coming up this week", href: "#coming-up" });
  expect(thisWeekTile(1).value).toBe("1 thing");
  expect(thisWeekTile(0)).toMatchObject({ value: "Quiet week", href: "/planner" });
});
