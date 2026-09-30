import { test, expect } from "@playwright/test";
import { groupHouseholds, layoutHouseholds, type HouseholdPerson } from "@/lib/household-layout";
import { relationships } from "@/lib/kinship";

/** The family tree drawn as households (30 September): who lives with whom,
 * where each card goes, and what everyone is called. */

const P = (id: string, f: string | null = null, m: string | null = null, s: string | null = null): HouseholdPerson => ({ id, fatherId: f, motherId: m, spouseId: s });

// Two sets of grandparents, a great-grandmother, two married sons (one of
// them "me"), an unmarried daughter at home, and grandchildren.
const family = [
  P("lola"),
  P("gf", null, "lola", "gm"), P("gm", null, null, "gf"),
  P("gf2", null, null, "gm2"), P("gm2", null, null, "gf2"),
  P("me", "gf", "gm", "wife"), P("wife", "gf2", "gm2", "me"),
  P("bro", "gf", "gm", "sil"), P("sil", null, null, "bro"),
  P("sis", "gf", "gm"),
  P("uncle", "gf2", "gm2"),
  P("kid1", "me", "wife"), P("kid2", "me", "wife"),
  P("nephew", "bro", "sil"),
];

const householdOf = (id: string) => {
  const { households, householdOf } = groupHouseholds(family);
  return households.find((h) => h.id === householdOf.get(id))!;
};
const ids = (slots: { id: string }[]) => slots.map((s) => s.id).sort();

test("a couple and their children at home are one household", () => {
  const mine = householdOf("me");
  expect(ids(mine.heads)).toEqual(["me", "wife"]);
  expect(ids(mine.kids)).toEqual(["kid1", "kid2"]);
});

test("a married child heads a household of their own and leaves their parents'", () => {
  const parents = householdOf("gf");
  expect(ids(parents.heads)).toEqual(["gf", "gm"]);
  expect(ids(parents.kids)).toEqual(["sis"]);
  expect(householdOf("bro").id).not.toBe(parents.id);
});

test("somebody on their own with no parents recorded still has a household", () => {
  expect(ids(householdOf("lola").heads)).toEqual(["lola"]);
  expect(householdOf("lola").kids).toEqual([]);
});

test("everybody is in exactly one household", () => {
  const { households } = groupHouseholds(family);
  const all = households.flatMap((h) => [...h.heads, ...h.kids].map((s) => s.id)).sort();
  expect(all).toEqual(family.map((p) => p.id).sort());
});

test("households sit a row below the households their heads grew up in", () => {
  const l = layoutHouseholds(family, "me");
  const y = (person: string) => l.households.find((h) => h.slots.some((s) => s.id === person))!.y;
  expect(y("gf")).toBeGreaterThan(y("lola"));
  expect(y("me")).toBeGreaterThan(y("gf"));
  expect(y("me")).toBe(y("bro"));
  expect(y("gf2")).toBe(y("gf"));
});

test("no two household cards overlap", () => {
  const l = layoutHouseholds(family, "me");
  for (const a of l.households)
    for (const b of l.households) {
      if (a === b) continue;
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
});

test("each spouse sits on the side of the family they came from", () => {
  const l = layoutHouseholds(family, "me");
  const mine = l.households.find((h) => h.slots.some((s) => s.id === "me"))!;
  const card = (person: string) => l.households.find((h) => h.slots.some((s) => s.id === person))!;
  const meX = mine.slots.find((s) => s.id === "me")!.x;
  const wifeX = mine.slots.find((s) => s.id === "wife")!.x;
  expect(meX < wifeX).toBe(card("gf").x < card("gf2").x);
});

test("a curve runs from each household down to every person who left it", () => {
  const l = layoutHouseholds(family, "me");
  const from = (person: string) => l.households.find((h) => h.slots.some((s) => s.id === person))!.id;
  const to = (person: string) => l.connectors.filter((c) => c.to === person).map((c) => c.from).sort();
  expect(to("me")).toEqual([from("gf")]);
  expect(to("wife")).toEqual([from("gf2")]);
  expect(to("gf")).toEqual([from("lola")]);
  // Children at home are joined inside their card, not by a curve between cards.
  expect(to("kid1")).toEqual([]);
});

test("picking somebody with no parents offers a card to add them, and a brother or sister", () => {
  const l = layoutHouseholds(family, "me", "lola");
  const ghost = l.households.find((h) => h.ghost)!;
  expect(ghost.slots.map((s) => s.kind).sort()).toEqual(["father", "mother", "sibling"]);
  expect(l.connectors.some((c) => c.from === ghost.id && c.to === "lola" && c.ghost)).toBe(true);
  // Nobody real moves into the dashed card.
  expect(ghost.slots.every((s) => s.kind !== "person")).toBe(true);
});

test("picking somebody with one parent puts the missing one beside them", () => {
  const l = layoutHouseholds(family, "me", "gf");
  const lolas = l.households.find((h) => h.slots.some((s) => s.id === "lola"))!;
  expect(lolas.slots.filter((s) => s.row === "head").map((s) => s.kind).sort()).toEqual(["father", "person"]);
  expect(lolas.slots.some((s) => s.kind === "sibling")).toBe(true);
});

test("an empty tree lays out without failing", () => {
  const l = layoutHouseholds([], null);
  expect(l.households).toEqual([]);
});

test("a spouse link to somebody not on the tree is ignored", () => {
  const { households } = groupHouseholds([P("a", null, null, "gone")]);
  expect(households.map((h) => ids(h.heads))).toEqual([["a"]]);
});

// ── what everybody is to you ──────────────────────────────────────────────
const sexed = family.map((p) => ({ ...p, sex: ["me", "bro", "uncle", "nephew", "kid1"].includes(p.id) ? "male" : ["sis", "wife", "sil", "kid2"].includes(p.id) ? "female" : null }));
const words = relationships(sexed, "me");

test("the family's words for each relationship", () => {
  expect(words.get("me")).toBe("You");
  expect(words.get("wife")).toBe("Wife");
  expect(words.get("gf")).toBe("Father");
  expect(words.get("gm")).toBe("Mother");
  expect(words.get("lola")).toBe("Grandmother");
  expect(words.get("bro")).toBe("Brother");
  expect(words.get("sis")).toBe("Sister");
  expect(words.get("sil")).toBe("Sister-in-law");
  expect(words.get("gf2")).toBe("Father-in-law");
  expect(words.get("uncle")).toBe("Brother-in-law");
  expect(words.get("kid1")).toBe("Son");
  expect(words.get("kid2")).toBe("Daughter");
  expect(words.get("nephew")).toBe("Nephew");
});

test("sex is read off the tree where no profile says, and left neutral where nothing does", () => {
  const plain = relationships(family, "me");
  expect(plain.get("gf")).toBe("Father"); // somebody's father
  expect(plain.get("sis")).toBe("Sibling"); // nothing says
});

test("nobody gets a word when the viewer is not on the tree", () => {
  expect(relationships(family, null).size).toBe(0);
});
