import { test, expect } from "@playwright/test";
import { daysLeftText, goalsATargetCanHelp } from "@/lib/goals";
import { goalGroups, targetGroups } from "@/lib/goal-groups";

/** A goal and the targets that get you there (Janine, 21 October): the
 * countdown on a goal, which goals a new target may help, and the Goals
 * tab's groups. */

test("the countdown to a goal's date", () => {
  expect(daysLeftText("2026-12-05", "2026-10-21")).toBe("45 days left");
  expect(daysLeftText("2026-10-22", "2026-10-21")).toBe("1 day left");
  expect(daysLeftText("2026-10-21", "2026-10-21")).toBe("Due today");
  expect(daysLeftText("2026-10-20", "2026-10-21")).toBe("1 day past the date");
  expect(daysLeftText("2026-10-16", "2026-10-21")).toBe("5 days past the date");
});

test("no date, no countdown", () => {
  expect(daysLeftText(null, "2026-10-21")).toBeNull();
  expect(daysLeftText("someday", "2026-10-21")).toBeNull();
});

test("across a month end and a leap day", () => {
  expect(daysLeftText("2027-01-01", "2026-12-31")).toBe("1 day left");
  expect(daysLeftText("2028-03-01", "2028-02-28")).toBe("2 days left");
});

const goals = [
  { id: "mine", ownerId: "ann" },
  { id: "his", ownerId: "abe" },
  { id: "house", ownerId: null },
];

test("one person's target helps their own goal or the household's", () => {
  expect(goalsATargetCanHelp(goals, ["ann"]).map((g) => g.id)).toEqual(["mine", "house"]);
});

test("a target for several people, or the whole family, helps only the household's", () => {
  expect(goalsATargetCanHelp(goals, ["ann", "abe"]).map((g) => g.id)).toEqual(["house"]);
  expect(goalsATargetCanHelp(goals, ["family"]).map((g) => g.id)).toEqual(["house"]);
  expect(goalsATargetCanHelp(goals, []).map((g) => g.id)).toEqual(["house"]);
});

const people = [
  { id: "ann", name: "Ann A" },
  { id: "abe", name: "Abe A" },
  { id: "kid", name: "Kid A" },
];

test("groups: the viewer first, then the household's order, the whole family last; nobody without goals", () => {
  const g = goalGroups([{ ownerId: null }, { ownerId: "abe" }, { ownerId: "ann" }, { ownerId: "abe" }], people, "ann");
  expect(g.map((x) => [x.key, x.label, x.goals.length])).toEqual([
    ["ann", "You", 1],
    ["abe", "Abe", 2],
    ["family", "Whole family", 1],
  ]);
});

test("groups: someone with no login of their own still gets theirs", () => {
  const g = goalGroups([{ ownerId: "gone" }], people, "ann");
  expect(g.map((x) => [x.key, x.label])).toEqual([["gone", "Someone"]]);
});

test("Target: grouped by goal in the goals' order, targets in theirs, goals with none left out", () => {
  const big = [{ id: "weight" }, { id: "books" }, { id: "empty" }];
  const t = [
    { id: "diet", helpsGoalId: "weight" },
    { id: "read", helpsGoalId: "books" },
    { id: "steps", helpsGoalId: "weight" },
  ];
  expect(targetGroups(t, big).map((g) => [g.goal?.id ?? null, g.targets.map((x) => x.id)])).toEqual([
    ["weight", ["diet", "steps"]],
    ["books", ["read"]],
  ]);
});

test("Target: a target that helps no goal -- or one the viewer cannot see -- comes last", () => {
  const t = [
    { id: "old", helpsGoalId: null },
    { id: "hidden", helpsGoalId: "private" },
    { id: "diet", helpsGoalId: "weight" },
  ];
  expect(targetGroups(t, [{ id: "weight" }]).map((g) => [g.goal?.id ?? null, g.targets.map((x) => x.id)])).toEqual([
    ["weight", ["diet"]],
    [null, ["old", "hidden"]],
  ]);
});
