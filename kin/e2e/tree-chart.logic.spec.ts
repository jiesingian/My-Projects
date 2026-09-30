import { test, expect } from "@playwright/test";
import { buildChart, seatCouples, withinDegree, TILE_W, type ChartNode } from "@/lib/tree-chart";
import { relationships } from "@/lib/kinship";
import { matchBranch, mergeBranch, sameName, type ChartPerson } from "@/lib/tree-merge";
import type { BranchPerson } from "@/lib/queries/tree-links";

/** The family tree chart after Jonathan's review of 30 September: people,
 * not invented households; regions only for households that exist on Kin;
 * co-parents seated together; and a second-degree close-family view. */

const N = (id: string, f: string | null = null, m: string | null = null, s: string | null = null, extra: Partial<ChartNode> = {}): ChartNode => ({ id, fatherId: f, motherId: m, spouseId: s, ...extra });

// Parents added one at a time ("Add father", "Add mother") are never
// recorded as married -- the shape of the real tree that looked wrong.
const family = [
  N("dad"), N("mum"),
  N("inlawDad"), N("inlawMum"),
  N("me", "dad", "mum", "wife"), N("wife", "inlawDad", "inlawMum", "me"),
  N("bro", "dad", "mum"),
  N("kid", "me", "wife"),
];
const at = (c: ReturnType<typeof buildChart>, id: string) => c.people.find((p) => p.id === id)!;

test("two parents of the same child with no marriage recorded sit together, as co-parents", () => {
  const { partnerOf, married } = seatCouples(family);
  expect(partnerOf.get("dad")).toBe("mum");
  expect(married.has("dad|mum")).toBe(false);
  expect(married.has("me|wife")).toBe(true);
  const c = buildChart(family, "me");
  expect(Math.abs(at(c, "dad").x - at(c, "mum").x)).toBeLessThanOrEqual(TILE_W + 18);
  const line = c.couples.find((x) => [x.a, x.b].sort().join() === "dad,mum")!;
  expect(line.married).toBe(false);
  expect(c.couples.find((x) => [x.a, x.b].sort().join() === "me,wife")!.married).toBe(true);
});

test("both sets of parents sit a row above the couple, not beside them", () => {
  const c = buildChart(family, "me");
  expect(at(c, "dad").y).toBeLessThan(at(c, "me").y);
  expect(at(c, "inlawDad").y).toBe(at(c, "dad").y);
  expect(c.families.some((f) => f.parentIds.includes("dad") && f.childIds.includes("me"))).toBe(true);
  expect(c.families.some((f) => f.parentIds.includes("inlawMum") && f.childIds.includes("wife"))).toBe(true);
});

test("a child with a different partner hangs from the two parents they share, and that partner sits beside them", () => {
  const withEx = [...family.map((n) => (n.id === "dad" ? { ...n, spouseId: "mum" } : n.id === "mum" ? { ...n, spouseId: "dad" } : n)), N("ex"), N("half", "dad", "ex")];
  const c = buildChart(withEx, "me");
  const f = c.families.find((x) => x.childIds.includes("half"))!;
  expect([...f.parentIds].sort()).toEqual(["dad", "ex"]);
  expect(Math.abs(at(c, "dad").x - at(c, "ex").x)).toBeLessThanOrEqual(TILE_W + 18);
  expect(relationships(withEx, "me").get("half")).toBe("Half-sibling");
});

test("only households that exist get a region, and it never takes in anybody outside them", () => {
  const c = buildChart(family, "me", [{ id: "mine", memberIds: ["me", "wife", "kid"] }]);
  expect(c.regions).toHaveLength(1);
  const outside = c.people.filter((p) => !["me", "wife", "kid"].includes(p.id));
  for (const rect of c.regions[0].rects)
    for (const p of outside) {
      const overlaps = p.x < rect.x + rect.w && p.x + TILE_W > rect.x && p.y < rect.y + rect.h && p.y + 112 > rect.y;
      expect(overlaps, `${p.id} inside the household`).toBe(false);
    }
});

test("a couple and their children are one box, not three", () => {
  const c = buildChart(family, "me", [{ id: "mine", memberIds: ["me", "wife", "kid"] }]);
  expect(c.regions[0].rects).toHaveLength(1);
});

test("close family is the second degree, counted the civil-law way", () => {
  const big = [...family, N("gran"), N("aunt", null, "gran"), N("cousin", null, "aunt"), N("grandkid", "kid")];
  big.find((n) => n.id === "dad")!.motherId = "gran";
  const near = withinDegree(big, "me", 2);
  for (const id of ["dad", "mum", "bro", "kid", "grandkid", "gran", "wife", "inlawDad", "inlawMum"]) expect(near.has(id), id).toBe(true);
  for (const id of ["aunt", "cousin"]) expect(near.has(id), id).toBe(false);
});

test("an empty tree lays out without failing", () => {
  expect(buildChart([], null).people).toEqual([]);
});

// ── the same relative typed in by two households ──────────────────────────
const ours = (id: string, name: string, extra: Partial<ChartPerson> = {}): ChartPerson => ({
  id, fullName: name, birthYear: null, avatarUrl: null, memberId: null, fatherId: null, motherId: null, spouseId: null, fromHousehold: null, ...extra,
});
const theirs = (id: string, name: string, extra: Partial<BranchPerson> = {}): BranchPerson => ({
  id, fullName: name, birthYear: null, fatherId: null, motherId: null, spouseId: null, isSharedPerson: false, ...extra,
});

test("names match on first and last name, ignoring middle names, accents and case", () => {
  expect(sameName({ fullName: "Stella M. Singián", birthYear: null }, { fullName: "stella singian", birthYear: "1960" })).toBe(true);
  expect(sameName({ fullName: "Stella Singian", birthYear: "1960" }, { fullName: "Stella Singian", birthYear: "1961" })).toBe(false);
  expect(sameName({ fullName: "Stella Singian", birthYear: null }, { fullName: "Stella Cruz", birthYear: null })).toBe(false);
});

test("a relative both households typed in is drawn once when both sit in the same place", () => {
  const mine = [ours("ed", "Eduardo Reyes", { fatherId: "gp" }), ours("gp", "Ramon Reyes"), ours("other", "Ramon Reyes")];
  const branch = [theirs("T-ed", "Eduardo Reyes", { isSharedPerson: true, fatherId: "T-gp" }), theirs("T-gp", "Ramon Reyes"), theirs("T-x", "Lita Reyes", { spouseId: "T-gp" })];
  const known = matchBranch(mine, branch, "ed");
  expect(known.get("T-gp")).toBe("gp");
  const merged = mergeBranch(mine, branch, "m1", "ed", "Reyes Household", known);
  expect(merged.filter((p) => p.fullName === "Ramon Reyes")).toHaveLength(2); // ours, and the unrelated "other"
  expect(merged.some((p) => p.id.startsWith("x:m1:T-gp"))).toBe(false);
  expect(merged.find((p) => p.fullName === "Lita Reyes")!.spouseId).toBe("gp");
});

test("a matching name somewhere else on the tree is not taken to be the same person", () => {
  const mine = [ours("ed", "Eduardo Reyes"), ours("gp", "Ramon Reyes")];
  const branch = [theirs("T-ed", "Eduardo Reyes", { isSharedPerson: true, fatherId: "T-gp" }), theirs("T-gp", "Ramon Reyes")];
  expect(matchBranch(mine, branch, "ed").size).toBe(0);
});

// ── what everybody is to you ──────────────────────────────────────────────
test("the family's words for each relationship", () => {
  const sexed = [...family, N("gran"), N("niece", "bro")].map((p) => ({
    ...p,
    sex: ["me", "bro", "kid"].includes(p.id) ? "male" : ["wife", "niece"].includes(p.id) ? "female" : null,
  }));
  sexed.find((n) => n.id === "dad")!.motherId = "gran";
  const w = relationships(sexed, "me");
  expect(w.get("me")).toBe("You");
  expect(w.get("wife")).toBe("Wife");
  expect(w.get("dad")).toBe("Father");
  expect(w.get("mum")).toBe("Mother");
  expect(w.get("gran")).toBe("Grandmother");
  expect(w.get("bro")).toBe("Brother");
  expect(w.get("inlawDad")).toBe("Father-in-law");
  expect(w.get("kid")).toBe("Son");
  expect(w.get("niece")).toBe("Niece");
});

test("nobody gets a word when the viewer is not on the tree", () => {
  expect(relationships(family, null).size).toBe(0);
});
