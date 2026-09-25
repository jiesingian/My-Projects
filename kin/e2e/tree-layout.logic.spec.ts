import { test, expect } from "@playwright/test";
import { layoutTree, CARD_W, CARD_H, type LayoutPerson } from "@/lib/tree-layout";

/** The family tree chart's placement rules. Each test is one thing a tree
 * reader relies on without thinking about it. */

const P = (id: string, f: string | null = null, m: string | null = null, s: string | null = null): LayoutPerson => ({ id, fatherId: f, motherId: m, spouseId: s });

function at(layout: ReturnType<typeof layoutTree>, id: string) {
  const p = layout.people.find((x) => x.id === id);
  if (!p) throw new Error(`${id} not placed`);
  return p;
}
function noOverlaps(layout: ReturnType<typeof layoutTree>) {
  for (const a of layout.people)
    for (const b of layout.people) {
      if (a === b || a.y !== b.y) continue;
      const overlap = a.x < b.x + CARD_W && b.x < a.x + CARD_W;
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
    }
}

// A three-generation household: grandparents on both sides, parents, children.
const household = [
  P("gf1", null, null, "gm1"), P("gm1", null, null, "gf1"),
  P("gf2", null, null, "gm2"), P("gm2", null, null, "gf2"),
  P("dad", "gf1", "gm1", "mum"), P("mum", "gf2", "gm2", "dad"),
  P("me", "dad", "mum"), P("sis", "dad", "mum"), P("bro", "dad", "mum"),
];

test("parents sit a row above their children, grandparents a row above that", () => {
  const l = layoutTree(household, "me");
  expect(at(l, "dad").y).toBeLessThan(at(l, "me").y);
  expect(at(l, "gf1").y).toBeLessThan(at(l, "dad").y);
  expect(at(l, "me").y - at(l, "dad").y).toBe(at(l, "dad").y - at(l, "gf1").y);
});

test("siblings share a row, and so do spouses", () => {
  const l = layoutTree(household, "me");
  expect(at(l, "sis").y).toBe(at(l, "me").y);
  expect(at(l, "mum").y).toBe(at(l, "dad").y);
});

test("a couple sits side by side", () => {
  const l = layoutTree(household, "me");
  expect(Math.abs(at(l, "mum").x - at(l, "dad").x)).toBeLessThan(CARD_W * 1.5);
  expect(l.couples.some((c) => [c.a, c.b].sort().join() === "dad,mum")).toBe(true);
});

test("children hang below the middle of their parents", () => {
  const l = layoutTree(household, "me");
  const fam = l.families.find((f) => f.childIds.includes("me"))!;
  const parentsMid = (at(l, "dad").x + at(l, "mum").x + CARD_W) / 2;
  const kidsMid = (Math.min(...fam.childXs) + Math.max(...fam.childXs)) / 2;
  expect(Math.abs(parentsMid - kidsMid)).toBeLessThan(CARD_W);
  expect(fam.childIds.sort()).toEqual(["bro", "me", "sis"]);
});

test("nobody overlaps anybody, however the tree branches", () => {
  noOverlaps(layoutTree(household, "me"));
  // Two brothers each with a spouse and three children: the widest row is the
  // cousins, and the parents' row must spread to sit over them.
  const wide = [
    P("g1", null, null, "g2"), P("g2", null, null, "g1"),
    P("a", "g1", "g2", "aw"), P("aw", null, null, "a"),
    P("b", "g1", "g2", "bw"), P("bw", null, null, "b"),
    ...["a1", "a2", "a3"].map((id) => P(id, "a", "aw")),
    ...["b1", "b2", "b3"].map((id) => P(id, "b", "bw")),
  ];
  noOverlaps(layoutTree(wide, "a1"));
});

test("a half-sibling hangs from the parent they actually share", () => {
  const l = layoutTree([P("dad", null, null, "mum"), P("mum", null, null, "dad"), P("ex"), P("me", "dad", "mum"), P("half", "dad", "ex")], "me");
  const shared = l.families.find((f) => f.childIds.includes("half"))!;
  expect(shared.parentIds.sort()).toEqual(["dad", "ex"]);
  expect(l.families.find((f) => f.childIds.includes("me"))!.childIds).toEqual(["me"]);
});

test("someone with no links still gets a place, not a crash", () => {
  const l = layoutTree([P("me"), P("stranger")], "me");
  expect(l.people).toHaveLength(2);
  noOverlaps(l);
});

test("a link to somebody not in the tree is ignored rather than drawn to nowhere", () => {
  const l = layoutTree([P("me", "deleted-father", null, "gone")], "me");
  expect(l.people).toHaveLength(1);
  expect(l.families).toHaveLength(0);
  expect(l.couples).toHaveLength(0);
});

test("records that contradict themselves do not loop or throw", () => {
  // Each is the other's father: impossible, and exactly what a mis-tap makes.
  const l = layoutTree([P("a", "b"), P("b", "a")], "a");
  expect(l.people).toHaveLength(2);
});

test("every coordinate is a real number inside the reported size", () => {
  const l = layoutTree(household, "me");
  for (const p of l.people) {
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + CARD_W).toBeLessThanOrEqual(l.width + 0.001);
    expect(p.y + CARD_H).toBeLessThanOrEqual(l.height + 0.001);
  }
});

test("the tree starts at the left edge, with no empty band beside it", () => {
  // Found by looking at the chart, not by these specs: everything had drifted
  // right and the shift back only ever moved things left of zero.
  for (const [tree, anchor] of [[household, "me"], [household, "gf1"]] as const) {
    const l = layoutTree([...tree], anchor);
    expect(Math.min(...l.people.map((p) => p.x))).toBe(0);
    expect(Math.max(...l.people.map((p) => p.x + CARD_W))).toBeCloseTo(l.width, 3);
  }
});

test("an empty tree is an empty chart", () => {
  const l = layoutTree([], null);
  expect(l.people).toHaveLength(0);
});

// Jonathan and Janine, both with their parents recorded, and Jonathan's
// sister. On 25 September the first layout put Jonathan 259 units away from
// his own parents, Ernesto and Stella: a couple aimed at the middle of all
// four of their parents, and rows could only push people right.
const twoSides = [
  P("ernesto", null, null, "stella"), P("stella", null, null, "ernesto"),
  P("rodel", null, null, "myrna"), P("myrna", null, null, "rodel"),
  P("sister", "ernesto", "stella"),
  P("jonathan", "ernesto", "stella", "janine"), P("janine", "rodel", "myrna", "jonathan"),
  P("erynne", "jonathan", "janine"), P("keira", "jonathan", "janine"),
];
const centre = (layout: ReturnType<typeof layoutTree>, id: string) => at(layout, id).x + CARD_W / 2;

test("a married child stays close under their own parents when both sides are recorded", () => {
  const layout = layoutTree(twoSides, "jonathan");
  noOverlaps(layout);
  const hisParents = (centre(layout, "ernesto") + centre(layout, "stella")) / 2;
  const herParents = (centre(layout, "rodel") + centre(layout, "myrna")) / 2;
  // Within about one card of their own parents' middle -- the first layout was 259 away.
  expect(Math.abs(centre(layout, "jonathan") - hisParents)).toBeLessThan(CARD_W);
  expect(Math.abs(centre(layout, "janine") - herParents)).toBeLessThan(CARD_W);
});

test("each spouse sits on the side of their own family", () => {
  const layout = layoutTree(twoSides, "jonathan");
  // His parents are laid out to the left of hers, so he takes the left seat,
  // and his sister is beside him rather than across the chart.
  expect(centre(layout, "ernesto")).toBeLessThan(centre(layout, "rodel"));
  expect(centre(layout, "jonathan")).toBeLessThan(centre(layout, "janine"));
  expect(Math.abs(centre(layout, "sister") - centre(layout, "jonathan"))).toBeLessThan(2 * CARD_W);
});
