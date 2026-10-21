import { test, expect } from "@playwright/test";
import { planHouseholdSeed, describeSeedPlan, seedPlanIsEmpty, type SeedMember, type SeedPerson } from "@/lib/tree-seed";

/** Seeding the household onto the tree: who gets a row, which two are
 * spouses, whose children the children are. Pure, so no database. */

const m = (id: string, role: string, sex: string | null = null, name = id): SeedMember => ({ id, full_name: name, role, sex });
const row = (id: string, memberId: string | null, over: Partial<SeedPerson> = {}): SeedPerson => ({ id, memberId, fatherId: null, motherId: null, spouseId: null, ...over });

const quinn = m("q", "parent", null, "Quinn Tester");
const pat = m("p", "parent", "female", "Pat Tester");
const robin = m("r", "child_managed", null, "Robin Tester");
const alex = m("a", "child_self", null, "Alex Tester");

test("an empty tree: everyone is added, the two parents are spouses, the children are theirs", () => {
  const plan = planHouseholdSeed([quinn, pat, robin, alex], []);
  expect(plan.insert.map((x) => x.id)).toEqual(["q", "p", "r", "a"]);
  expect(plan.spouse).toEqual({ a: quinn, b: pat });
  // Pat is female, so Quinn takes the father slot although their sex is unknown.
  expect(plan.children.map((c) => [c.child.id, c.father?.id, c.mother?.id])).toEqual([
    ["r", "q", "p"],
    ["a", "q", "p"],
  ]);
  expect(describeSeedPlan(plan, "q")).toBe("Adds you, Pat, Robin and Alex; Pat as your spouse; Robin and Alex as your children.");
});

test("only the viewer on the tree: the rest are added and linked, the viewer's row is reused", () => {
  const plan = planHouseholdSeed([quinn, pat, robin], [row("t1", "q")]);
  expect(plan.insert.map((x) => x.id)).toEqual(["p", "r"]);
  expect(plan.spouse?.a.id).toBe("q");
  expect(describeSeedPlan(plan, "q")).toBe("Adds Pat and Robin; Pat as your spouse; Robin as your child.");
});

test("an adult who is not a parent is placed but not linked to anyone", () => {
  const lola = m("l", "adult", "female", "Lola Tester");
  const plan = planHouseholdSeed([quinn, lola, robin], []);
  expect(plan.insert.map((x) => x.id)).toEqual(["q", "l", "r"]);
  expect(plan.spouse).toBeNull();
  expect(plan.children).toEqual([{ child: robin, father: quinn, mother: null }]);
  expect(describeSeedPlan(plan, "q")).toBe("Adds you, Lola and Robin; Robin as your child.");
});

test("a single parent of unknown sex is the father, as the chart's own form assumes", () => {
  const plan = planHouseholdSeed([quinn, robin], []);
  expect(plan.children[0]).toEqual({ child: robin, father: quinn, mother: null });
});

test("two parents both of unknown sex: the first is the father, the second the mother", () => {
  const other = m("o", "parent", null, "Other Tester");
  const plan = planHouseholdSeed([quinn, other, robin], []);
  expect(plan.children[0].father?.id).toBe("q");
  expect(plan.children[0].mother?.id).toBe("o");
});

test("a spouse recorded with someone else is left alone; a child with a parent recorded is left alone", () => {
  const plan = planHouseholdSeed([quinn, pat, robin], [row("t1", "q", { spouseId: "t9" }), row("t9", null), row("t3", "r", { fatherId: "t9" })]);
  expect(plan.spouse).toBeNull();
  expect(plan.children).toEqual([]);
  expect(plan.insert.map((x) => x.id)).toEqual(["p"]);
});

test("a tree that already has everyone linked has nothing to do", () => {
  const plan = planHouseholdSeed([quinn, pat, robin], [row("t1", "q", { spouseId: "t2" }), row("t2", "p", { spouseId: "t1" }), row("t3", "r", { fatherId: "t1", motherId: "t2" })]);
  expect(seedPlanIsEmpty(plan)).toBe(true);
  expect(describeSeedPlan(plan, "q")).toBe("");
});

test("three parents is not a shape the plan guesses at: rows only, no links", () => {
  const plan = planHouseholdSeed([quinn, pat, m("x", "parent", "male"), robin], []);
  expect(plan.spouse).toBeNull();
  expect(plan.children).toEqual([]);
  expect(plan.insert).toHaveLength(4);
});

test("the sentence from the other parent's side", () => {
  const plan = planHouseholdSeed([quinn, pat, robin], []);
  expect(describeSeedPlan(plan, "p")).toBe("Adds you, Quinn and Robin; Quinn as your spouse; Robin as your child.");
});
