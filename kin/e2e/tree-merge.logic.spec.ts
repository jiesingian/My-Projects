import { test, expect } from "@playwright/test";
import { mergeBranch, type ChartPerson } from "@/lib/tree-merge";
import type { BranchPerson } from "@/lib/queries/tree-links";

/** Joining a linked household's branch onto our tree. The rule every test
 * here is about: the shared person is drawn once, and the branch hangs off
 * them. */

const ours = (id: string, extra: Partial<ChartPerson> = {}): ChartPerson => ({
  id, fullName: id, birthYear: null, avatarUrl: null, memberId: null, fatherId: null, motherId: null, spouseId: null, fromHousehold: null, ...extra,
});
const theirs = (id: string, extra: Partial<BranchPerson> = {}): BranchPerson => ({
  id, fullName: id, birthYear: null, fatherId: null, motherId: null, spouseId: null, isSharedPerson: false, ...extra,
});

// Our Eduardo, matched to theirs. They also have Eduardo's father Ramon, and
// Eduardo's son Miguel with his wife Ana.
const branch = [
  theirs("T-ramon"),
  theirs("T-ed", { isSharedPerson: true, fatherId: "T-ramon", spouseId: "T-ter" }),
  theirs("T-ter", { spouseId: "T-ed" }),
  theirs("T-miguel", { fatherId: "T-ed", motherId: "T-ter", spouseId: "T-ana" }),
  theirs("T-ana", { spouseId: "T-miguel" }),
];
const mine = [ours("ed", { spouseId: "ter" }), ours("ter", { spouseId: "ed" }), ours("jon", { fatherId: "ed", motherId: "ter" })];

test("the shared person is drawn once, as ours", () => {
  const m = mergeBranch(mine, branch, "M1", "ed", "Reyes");
  expect(m.filter((p) => p.fullName === "T-ed")).toHaveLength(0);
  expect(m.find((p) => p.id === "ed")).toBeTruthy();
});

test("their son hangs off our Eduardo", () => {
  const m = mergeBranch(mine, branch, "M1", "ed", "Reyes");
  expect(m.find((p) => p.fullName === "T-miguel")?.fatherId).toBe("ed");
});

test("their record of Eduardo's father fills the gap in ours", () => {
  const m = mergeBranch(mine, branch, "M1", "ed", "Reyes");
  const ramon = m.find((p) => p.fullName === "T-ramon")!;
  expect(m.find((p) => p.id === "ed")?.fatherId).toBe(ramon.id);
});

test("but never overrules a parent we already recorded", () => {
  const withDad = [ours("ourRamon"), ours("ed", { fatherId: "ourRamon" }), ...mine.slice(1)];
  const m = mergeBranch(withDad, branch, "M1", "ed", "Reyes");
  expect(m.find((p) => p.id === "ed")?.fatherId).toBe("ourRamon");
});

test("a second match stops Grandma appearing twice", () => {
  const m = mergeBranch(mine, branch, "M1", "ed", "Reyes", new Map([["T-ter", "ter"]]));
  expect(m.filter((p) => p.fullName === "T-ter")).toHaveLength(0);
  expect(m.find((p) => p.fullName === "T-miguel")?.motherId).toBe("ter");
});

test("everybody from the branch is marked as theirs, and namespaced", () => {
  const m = mergeBranch(mine, branch, "M1", "ed", "Reyes");
  for (const p of m.filter((x) => x.fromHousehold)) {
    expect(p.fromHousehold).toBe("Reyes");
    expect(p.id.startsWith("x:M1:")).toBe(true);
  }
  expect(m.filter((x) => !x.fromHousehold).map((x) => x.id).sort()).toEqual(["ed", "jon", "ter"]);
});
