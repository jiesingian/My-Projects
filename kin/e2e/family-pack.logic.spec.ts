import { test, expect } from "@playwright/test";
import { PACK_GOALS, PACK_REWARDS, packGoalsFor } from "@/lib/family-pack";
import { partWorth } from "@/lib/game";

/** The family starter pack (Janine, 20 October): what it adds, for whom. */

const roles = { mum: "janine", dad: "jonathan", child: "erynne", baby: "keira" };

test("everyone's goals, and the family's four weekly goals, with Kin Plus", () => {
  const { personal, family, skippedForPlus } = packGoalsFor(roles, { plus: true, existing: [] });
  expect(personal.filter((g) => g.owner === "janine")).toHaveLength(PACK_GOALS.mum.length);
  expect(personal.filter((g) => g.owner === "keira")).toHaveLength(4);
  expect(family.map((g) => g.title)).toEqual(["Stroller walk together", "Dinner together, no phones", "Weekend park or playground trip", "Parents' steps this week"]);
  expect(skippedForPlus).toBe(0);
});

test("without Kin Plus, the steps goals are left out and counted", () => {
  const { personal, family, skippedForPlus } = packGoalsFor(roles, { plus: false, existing: [] });
  expect(personal.some((g) => g.kind === "steps")).toBe(false);
  expect(family.some((g) => g.kind === "steps")).toBe(false);
  expect(skippedForPlus).toBe(3); // Mum's, Dad's, and the parents' week
});

test("pressing it twice adds nothing twice", () => {
  const first = packGoalsFor(roles, { plus: true, existing: [] });
  const existing = [...first.personal.map((g) => ({ ownerId: g.owner, title: g.title })), ...first.family.map((g) => ({ ownerId: null, title: g.title }))];
  const again = packGoalsFor(roles, { plus: true, existing });
  expect(again.personal).toHaveLength(0);
  expect(again.family).toHaveLength(0);
});

test("leaving someone out leaves their goals out", () => {
  const { personal } = packGoalsFor({ mum: "janine" }, { plus: true, existing: [] });
  expect(new Set(personal.map((g) => g.owner))).toEqual(new Set(["janine"]));
});

test("the baby's goals credit the grown-up who ticks them; the young child's are her own", () => {
  expect(PACK_GOALS.baby.every((g) => g.creditTo === "logger")).toBe(true);
  expect(PACK_GOALS.child.every((g) => (g.creditTo ?? "owner") === "owner")).toBe(true);
  expect(PACK_GOALS.baby.filter((g) => g.strollerLinked).map((g) => g.title)).toEqual(["Outdoor time or stroller walk"]);
});

test("each grown-up has one backup goal, and stretch breaks only on weekdays", () => {
  for (const role of ["mum", "dad"] as const) {
    expect(PACK_GOALS[role].filter((g) => g.backup)).toHaveLength(1);
    expect(PACK_GOALS[role].find((g) => /stretch/i.test(g.title))?.days).toEqual([1, 2, 3, 4, 5]);
  }
});

test("timed goals are a single Done check", () => {
  const timed = [...PACK_GOALS.mum, ...PACK_GOALS.dad, ...PACK_GOALS.child].filter((g) => /minutes/.test(g.title));
  expect(timed.length).toBeGreaterThan(0);
  expect(timed.every((g) => g.target === 1)).toBe(true);
});

test("the rewards: the money notes, and the family treat is unlocked, not bought", () => {
  expect(PACK_REWARDS.child.find((r) => /sticker/.test(r.title))?.budget).toBe(50);
  expect(PACK_REWARDS.grownUps.find((r) => /Date night/.test(r.title))?.budget).toBe(1000);
  expect(PACK_REWARDS.family).toEqual([expect.objectContaining({ budget: 800, unlock: "family_week" })]);
  // A half-and-rest split still adds up for any goal worth odd coins.
  expect(partWorth(5, "half") + partWorth(5, "rest")).toBe(5);
});
