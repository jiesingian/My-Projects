import { test, expect } from "@playwright/test";
import { buildFamilyTree, type TreePerson } from "@/lib/queries/family";

/** The graph-walking half of the family tree -- which side of the tree
 * everyone in family_tree_people ends up on -- checked here without a
 * database, since none of it depends on a request. buildFamilyTree is pure:
 * getFamilyTree is just the fetch in front of it. */

function person(id: string, fields: Partial<TreePerson> = {}): TreePerson {
  return {
    id,
    memberId: fields.memberId ?? null,
    fullName: fields.fullName ?? id,
    dob: fields.dob ?? null,
    notes: fields.notes ?? null,
    avatarUrl: fields.avatarUrl ?? null,
    fatherId: fields.fatherId ?? null,
    motherId: fields.motherId ?? null,
    spouseId: fields.spouseId ?? null,
  };
}

test("with no one centred on, everyone is unplaced and both sides are empty", () => {
  const people = [person("a"), person("b")];
  const tree = buildFamilyTree(people, null);
  expect(tree.centerId).toBeNull();
  expect(tree.fatherSide).toEqual([]);
  expect(tree.motherSide).toEqual([]);
  expect(tree.core).toEqual([]);
  expect(tree.unplaced.map((p) => p.id).sort()).toEqual(["a", "b"]);
});

test("centring on someone not yet in the tree behaves the same as no one", () => {
  const people = [person("a", { memberId: "m-a" })];
  const tree = buildFamilyTree(people, "m-nobody");
  expect(tree.centerId).toBeNull();
  expect(tree.unplaced).toHaveLength(1);
});

test("a father and a mother land on opposite sides, not the same one", () => {
  const people = [
    person("me", { memberId: "m-me", fatherId: "dad", motherId: "mom" }),
    person("dad", { fullName: "Dad" }),
    person("mom", { fullName: "Mom" }),
  ];
  const tree = buildFamilyTree(people, "m-me");
  expect(tree.fatherSide.map((e) => e.person.id)).toEqual(["dad"]);
  expect(tree.motherSide.map((e) => e.person.id)).toEqual(["mom"]);
});

/** The bug this guards: father.spouse_id is the centre's own mother, and
 * naively walking a spouse link from every ancestor would pull the entire
 * maternal line into the paternal one at the very first step. */
test("a parent's spouse_id pointing at the centre's other parent doesn't merge the two sides", () => {
  const people = [
    person("me", { memberId: "m-me", fatherId: "dad", motherId: "mom" }),
    person("dad", { fullName: "Dad", spouseId: "mom" }),
    person("mom", { fullName: "Mom", spouseId: "dad" }),
  ];
  const tree = buildFamilyTree(people, "m-me");
  expect(tree.fatherSide.map((e) => e.person.id)).toEqual(["dad"]);
  expect(tree.motherSide.map((e) => e.person.id)).toEqual(["mom"]);
});

/** A step-parent is a different id from the excluded one, so nothing stops
 * them being included -- only the centre's actual other parent is excluded. */
test("a step-parent (a different spouse_id) is still pulled in as part of that side", () => {
  const people = [
    person("me", { memberId: "m-me", fatherId: "dad", motherId: "mom" }),
    person("dad", { fullName: "Dad", spouseId: "stepmom" }),
    person("mom", { fullName: "Mom" }),
    person("stepmom", { fullName: "Stepmom" }),
  ];
  const tree = buildFamilyTree(people, "m-me");
  expect(tree.fatherSide.map((e) => e.person.id).sort()).toEqual(["dad", "stepmom"]);
});

test("grandparents land one generation further out than the parent who leads to them", () => {
  const people = [
    person("me", { memberId: "m-me", fatherId: "dad" }),
    person("dad", { fatherId: "grandpa", motherId: "grandma" }),
    person("grandpa"),
    person("grandma"),
  ];
  const tree = buildFamilyTree(people, "m-me");
  const byId = Object.fromEntries(tree.fatherSide.map((e) => [e.person.id, e.depth]));
  expect(byId.dad).toBe(1);
  expect(byId.grandpa).toBe(2);
  expect(byId.grandma).toBe(2);
});

test("a parent's sibling (an aunt or uncle) shows up on that same side, at that parent's depth", () => {
  const people = [
    person("me", { memberId: "m-me", fatherId: "dad" }),
    person("dad", { fatherId: "grandpa", motherId: "grandma" }),
    person("uncle", { fatherId: "grandpa", motherId: "grandma" }),
    person("grandpa"),
    person("grandma"),
  ];
  const tree = buildFamilyTree(people, "m-me");
  const uncleEntry = tree.fatherSide.find((e) => e.person.id === "uncle");
  expect(uncleEntry?.depth).toBe(1);
});

test("the centre's own siblings and spouse sit in the core, not on either side", () => {
  const people = [
    person("me", { memberId: "m-me", fatherId: "dad", motherId: "mom", spouseId: "partner" }),
    person("sister", { fatherId: "dad", motherId: "mom" }),
    person("partner"),
    person("dad"),
    person("mom"),
  ];
  const tree = buildFamilyTree(people, "m-me");
  const coreIds = tree.core.map((p) => p.id).sort();
  expect(coreIds).toEqual(["me", "partner", "sister"]);
});

test("children of the centre or their spouse are listed separately from the core", () => {
  const people = [
    person("me", { memberId: "m-me", spouseId: "partner" }),
    person("partner"),
    person("kid1", { fatherId: "me" }),
    person("kid2", { motherId: "partner" }),
  ];
  const tree = buildFamilyTree(people, "m-me");
  expect(tree.children.map((p) => p.id).sort()).toEqual(["kid1", "kid2"]);
  expect(tree.core.map((p) => p.id)).not.toContain("kid1");
});

test("someone on record but not linked to anyone stays unplaced rather than vanishing", () => {
  const people = [person("me", { memberId: "m-me" }), person("stranger")];
  const tree = buildFamilyTree(people, "m-me");
  expect(tree.unplaced.map((p) => p.id)).toEqual(["stranger"]);
});

test("a member-linked row prefers the live member's name and dob over its own stored copy", () => {
  // getFamilyTree overwrites fullName/dob from the members join before this
  // ever runs -- this only proves buildFamilyTree doesn't second-guess
  // whatever it's handed, so a stale full_name on the row can't leak through.
  const people = [person("me", { memberId: "m-me", fullName: "Live Name", dob: "1990-01-01" })];
  const tree = buildFamilyTree(people, "m-me");
  expect(tree.core[0].fullName).toBe("Live Name");
});
