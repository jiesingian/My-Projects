import { test, expect } from "@playwright/test";
import { BONUSES, allDailiesDone, closeDay, earnedBadges, levelFromXp, nextMilestone, wholeFamilyDone, xpTotal, type BadgeRule } from "@/lib/game";

/** Goals and Rewards as a game (Janine, 20 October). The same rules the
 * nightly job runs in the database (20261020120000; its PGlite probe
 * goals-game.mjs runs the real thing). */

test("XP is summed from counted claims and bonuses; waiting and refused claims are not XP", () => {
  const claims = [
    { xp: 10, status: "counted" },
    { xp: 10, status: "pending" },
    { xp: 10, status: "refused" },
    { xp: 15, status: "counted" },
  ];
  expect(xpTotal(claims, [{ xp: BONUSES.allDailiesDone.xp }, { xp: BONUSES.wholeFamilyDone.xp }])).toBe(75);
  expect(xpTotal([], [])).toBe(0);
});

test("levels: 2 at 100 XP, 3 at 250, 4 at 450, 5 at 700", () => {
  expect(levelFromXp(0).level).toBe(1);
  expect(levelFromXp(99).level).toBe(1);
  expect(levelFromXp(100).level).toBe(2);
  expect(levelFromXp(249).level).toBe(2);
  expect(levelFromXp(250).level).toBe(3);
  expect(levelFromXp(449).level).toBe(3);
  expect(levelFromXp(450).level).toBe(4);
  expect(levelFromXp(700).level).toBe(5);
});

test("the level bar: how far into this level, out of how much", () => {
  expect(levelFromXp(130)).toEqual({ level: 2, into: 30, needed: 150, nextAt: 250 });
  expect(levelFromXp(0)).toEqual({ level: 1, into: 0, needed: 100, nextAt: 100 });
  expect(levelFromXp(-5).level).toBe(1);
  expect(levelFromXp(Number.NaN).level).toBe(1);
});

test("a day with every daily done adds one to the streak", () => {
  expect(closeDay({ streak: 4, best: 4, freezes: 1 }, true, "2026-10-14")).toEqual({ streak: 5, best: 5, freezes: 1, freezeUsed: false });
});

test("a missed day with no freeze resets the streak, and the best stays", () => {
  expect(closeDay({ streak: 4, best: 9, freezes: 0 }, false, "2026-10-14")).toEqual({ streak: 0, best: 9, freezes: 0, freezeUsed: false });
});

test("a missed day uses the freeze and keeps the streak", () => {
  expect(closeDay({ streak: 4, best: 4, freezes: 1 }, false, "2026-10-14")).toEqual({ streak: 4, best: 4, freezes: 0, freezeUsed: true });
});

test("with no streak to keep, the freeze is not spent", () => {
  expect(closeDay({ streak: 0, best: 2, freezes: 1 }, false, "2026-10-14")).toEqual({ streak: 0, best: 2, freezes: 1, freezeUsed: false });
});

test("the freeze is refilled when Sunday closes, ready for Monday", () => {
  // Saturday 17 October: freeze used. Sunday 18 October: missed again, so the
  // streak goes -- and then the week's freeze is back.
  const sat = closeDay({ streak: 4, best: 4, freezes: 1 }, false, "2026-10-17");
  expect(sat.freezes).toBe(0);
  const sun = closeDay(sat, false, "2026-10-18");
  expect(sun).toEqual({ streak: 0, best: 4, freezes: 1, freezeUsed: false });
  // Not on any other day.
  expect(closeDay({ streak: 1, best: 1, freezes: 0 }, true, "2026-10-19").freezes).toBe(0);
});

test("the all-dailies bonus needs every daily, and at least one", () => {
  expect(allDailiesDone(["a", "b"], new Set(["a", "b"]))).toBe(true);
  expect(allDailiesDone(["a", "b"], new Set(["a"]))).toBe(false);
  expect(allDailiesDone([], new Set())).toBe(false);
});

test("the whole-family bonus only when every player finished, and there are two or more", () => {
  expect(wholeFamilyDone([{ done: true }, { done: true }, { done: true }])).toBe(true);
  expect(wholeFamilyDone([{ done: true }, { done: false }, { done: true }])).toBe(false);
  expect(wholeFamilyDone([{ done: true }])).toBe(false);
  expect(wholeFamilyDone([])).toBe(false);
});

test("badges at the streak milestones, levels, totals and family streaks", () => {
  const rules: BadgeRule[] = [
    { id: "streak_3", rule: "streak", category: null, threshold: 3 },
    { id: "streak_7", rule: "streak", category: null, threshold: 7 },
    { id: "level_2", rule: "level", category: null, threshold: 2 },
    { id: "done_10", rule: "total_completions", category: null, threshold: 10 },
    { id: "water_20", rule: "total_completions", category: "water", threshold: 20 },
    { id: "family_3", rule: "family_streak", category: null, threshold: 3 },
  ];
  expect(earnedBadges(rules, { bestStreak: 2, xp: 99, familyBest: 0, completions: {} })).toEqual([]);
  expect(earnedBadges(rules, { bestStreak: 3, xp: 100, familyBest: 3, completions: { water: 6, move: 4 } })).toEqual(["streak_3", "level_2", "done_10", "family_3"]);
  expect(earnedBadges(rules, { bestStreak: 7, xp: 0, familyBest: 0, completions: { water: 20 } })).toEqual(["streak_3", "streak_7", "done_10", "water_20"]);
});

test("the next milestone ahead", () => {
  expect(nextMilestone(0)).toBe(3);
  expect(nextMilestone(3)).toBe(7);
  expect(nextMilestone(29)).toBe(30);
  expect(nextMilestone(100)).toBe(null);
});
