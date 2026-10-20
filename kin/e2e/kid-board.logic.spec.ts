import { test, expect } from "@playwright/test";
import { boardGoals, isBoard, progressPips } from "@/lib/kid-board";

/** A young child's sticker board (Janine, 20 October). */

test("three or four at a time; the next comes as each is done; done ones are stickers", () => {
  const goals = ["a", "b", "c", "d", "e"].map((id) => ({ id, reached: false }));
  const first = boardGoals(goals, 4);
  expect(first.showing.map((g) => g.id)).toEqual(["a", "b", "c", "d"]);
  expect(first.waiting).toBe(1);
  const later = boardGoals(goals.map((g) => (g.id === "a" ? { ...g, reached: true } : g)), 4);
  expect(later.showing.map((g) => g.id)).toEqual(["b", "c", "d", "e"]);
  expect(later.stickers.map((g) => g.id)).toEqual(["a"]);
  expect(later.waiting).toBe(0);
});

test("pictures to fill instead of numbers, 7.5 cups being eight", () => {
  expect(progressPips(0, 1)).toEqual([false]);
  expect(progressPips(1, 2)).toEqual([true, false]);
  expect(progressPips(3, 7.5)).toEqual([true, true, true, false, false, false, false, false]);
  expect(progressPips(8, 7.5).every(Boolean)).toBe(true);
  // A big target shows a share of ten.
  expect(progressPips(500, 1000).filter(Boolean)).toHaveLength(5);
});

test("a young child's own goals with pictures are a board; a baby's (credited to the grown-up) are not", () => {
  expect(isBoard([{ creditTo: "owner", emoji: "🌳" }, { creditTo: "owner", emoji: "🍎" }])).toBe(true);
  expect(isBoard([{ creditTo: "logger", emoji: "📚" }])).toBe(false);
  expect(isBoard([{ creditTo: "owner", emoji: null }])).toBe(false);
  expect(isBoard([])).toBe(false);
});
