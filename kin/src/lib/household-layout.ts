/** The family tree drawn as households rather than as loose people.
 *
 * Jonathan's note on the old chart (30 September) was that it "looks Windows
 * XP era": forty equal boxes on a grid, and nothing saying which of them live
 * together. A family is read in households -- Lolo and Lola's, ours, Tita's --
 * so that is the unit this draws: each household one soft card, the couple
 * side by side along its top, the children still at home in a row under them,
 * and a curve from each household down to the ones its children went on to
 * start.
 *
 * Nothing in the database says who lives with whom, so a household is read
 * off the tree the way anybody would read it:
 *
 *  - Somebody married, or with children of their own, heads a household --
 *    with their spouse, if one is recorded.
 *  - Somebody with no parents on record heads one too, even alone; there is
 *    nowhere else to put them.
 *  - Everybody else is a child still at home, in their parents' household.
 *
 * So a daughter who marries moves out of her parents' card and into her own,
 * the way she does in life, and a curve from her parents' card to her keeps
 * where she came from.
 *
 * Pure: people in, cards and curves out, so the rules are tested without a
 * browser -- see e2e/household-layout.logic.spec.ts. The generations and the
 * packing are layoutTree's, which already keeps a family under its parents
 * without drifting; here each "person" it places is a whole household.
 */

import { layoutTree } from "@/lib/tree-layout";

export type HouseholdPerson = { id: string; fatherId: string | null; motherId: string | null; spouseId: string | null };

/** One place on a card: a person, or a dashed place to add one. */
export type Slot = { id: string; kind: "person" } | { id: string; kind: "father" | "mother" | "sibling"; of: string };

export type Household = { id: string; heads: Slot[]; kids: Slot[]; ghost: boolean };

export type PlacedSlot = Slot & { x: number; y: number; row: "head" | "kid" };
export type PlacedHousehold = Household & { x: number; y: number; w: number; h: number; generation: number; slots: PlacedSlot[] };
/** A curve from one household down to a person in another: where they came from. */
export type Connector = { from: string; to: string; d: string; ghost: boolean; end: { x: number; y: number } };
/** The lines inside a card: the couple's, and down to each child at home. */
export type Inner = { household: string; d: string; ghost: boolean };

export type HouseholdChart = { households: PlacedHousehold[]; connectors: Connector[]; inner: Inner[]; width: number; height: number };

// Sizes in px at the default text size; the chart draws them in rem, so the
// whole thing grows with the reader's text size.
export const TILE_W = 92;
export const TILE_H = 110;
export const AVATAR = 52;
const TILE_GAP = 8;
const PAD = 12;
const HEADER = 30; // the household's name
const KID_GAP = 26; // between the couple and the children, room for their lines
const KIDS_PER_ROW = 4;
const UNIT_GAP = 28;
const ROW_GAP = 80;

const rowWidth = (n: number) => n * TILE_W + Math.max(0, n - 1) * TILE_GAP;
const kidRows = (n: number) => Math.ceil(n / KIDS_PER_ROW);
export function householdSize(h: { heads: unknown[]; kids: unknown[] }) {
  const cols = Math.max(1, h.heads.length, Math.min(h.kids.length, KIDS_PER_ROW));
  const rows = kidRows(h.kids.length);
  return {
    w: 2 * PAD + rowWidth(cols),
    h: PAD + HEADER + TILE_H + (rows ? KID_GAP + rows * TILE_H + (rows - 1) * TILE_GAP : 0) + PAD,
  };
}

/** A smooth S from one point down to another. */
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const my = (y2 - y1) / 2;
  return `M${x1},${y1}C${x1},${y1 + my} ${x2},${y2 - my} ${x2},${y2}`;
};

/** Who lives with whom, by the rules at the top of this file. Children keep
 * the order they came in, so the caller decides it (eldest first). */
export function groupHouseholds(input: HouseholdPerson[]): { households: Household[]; householdOf: Map<string, string> } {
  const byId = new Map(input.map((p) => [p.id, p]));
  const has = (id: string | null | undefined): id is string => !!id && byId.has(id);
  const spouse = new Map<string, string>();
  for (const p of input) {
    if (has(p.spouseId) && p.spouseId !== p.id) {
      if (!spouse.has(p.id)) spouse.set(p.id, p.spouseId);
      if (!spouse.has(p.spouseId)) spouse.set(p.spouseId, p.id);
    }
  }
  const parentsOf = (p: HouseholdPerson) => [p.fatherId, p.motherId].filter(has);
  const hasChildren = new Set(input.flatMap(parentsOf));
  const heads = (p: HouseholdPerson) => spouse.has(p.id) || hasChildren.has(p.id) || parentsOf(p).length === 0;

  const households: Household[] = [];
  const householdOf = new Map<string, string>();
  const byHousehold = new Map<string, Household>();
  for (const p of input) {
    if (householdOf.has(p.id) || !heads(p)) continue;
    const s = spouse.get(p.id);
    const ids = s && !householdOf.has(s) ? [p.id, s] : [p.id];
    const h: Household = { id: `h:${[...ids].sort().join("+")}`, heads: ids.map((id) => ({ id, kind: "person" })), kids: [], ghost: false };
    households.push(h);
    byHousehold.set(h.id, h);
    for (const id of ids) householdOf.set(id, h.id);
  }
  for (const p of input) {
    if (householdOf.has(p.id)) continue;
    const [f, m] = [p.fatherId, p.motherId].map((id) => (has(id) ? householdOf.get(id) : undefined));
    // Both parents' household when they share one, else the father's, else
    // the mother's. A parent always heads a household (they have a child),
    // so one of these is always there.
    const home = byHousehold.get((f && f === m ? f : (f ?? m))!)!;
    home.kids.push({ id: p.id, kind: "person" });
    householdOf.set(p.id, home.id);
  }
  return { households, householdOf };
}

/** Lay the households out as a tree of cards, with dashed places to add the
 * parents and a brother or sister of `addFor` when it is given. */
export function layoutHouseholds(input: HouseholdPerson[], anchorId: string | null, addFor: string | null = null): HouseholdChart {
  const byId = new Map(input.map((p) => [p.id, p]));
  const has = (id: string | null | undefined): id is string => !!id && byId.has(id);
  const { households, householdOf } = groupHouseholds(input);
  const hById = new Map(households.map((h) => [h.id, h]));

  // ── dashed places to add somebody ───────────────────────────────────────
  // With no parents recorded they get a card of their own above; with one,
  // the missing one goes beside them when they are on their own; a brother
  // or sister always goes with the children at home, where one would live.
  const extraOrigin = new Map<string, string>(); // household -> ghost household above it
  const ghostLinks: { from: string; to: string }[] = [];
  const f = addFor ? byId.get(addFor) : undefined;
  if (f) {
    const father = has(f.fatherId) ? f.fatherId : null;
    const mother = has(f.motherId) ? f.motherId : null;
    const sibling: Slot = { id: `ghost-sibling-${f.id}`, kind: "sibling", of: f.id };
    if (!father && !mother) {
      const g: Household = {
        id: `ghost:${f.id}`,
        heads: [
          { id: `ghost-father-${f.id}`, kind: "father", of: f.id },
          { id: `ghost-mother-${f.id}`, kind: "mother", of: f.id },
        ],
        kids: [sibling],
        ghost: true,
      };
      households.push(g);
      hById.set(g.id, g);
      extraOrigin.set(householdOf.get(f.id)!, g.id);
      ghostLinks.push({ from: g.id, to: f.id });
    } else {
      const home = hById.get(householdOf.get(father ?? mother!)!)!;
      if (!(father && mother) && home.heads.length === 1) {
        const missing: Slot = father ? { id: `ghost-mother-${f.id}`, kind: "mother", of: f.id } : { id: `ghost-father-${f.id}`, kind: "father", of: f.id };
        home.heads = father ? [...home.heads, missing] : [missing, ...home.heads];
      }
      home.kids = [...home.kids, sibling];
    }
  }

  // ── where each household came from ──────────────────────────────────────
  // The households its heads grew up in, left head first: those are its
  // "parents" to the layout, which is what hangs it under them.
  const origins = new Map<string, string[]>();
  for (const h of households) {
    if (h.ghost) continue;
    const out: string[] = [];
    for (const s of h.heads) {
      if (s.kind !== "person") continue;
      if (s.id === f?.id && extraOrigin.has(h.id)) out.push(extraOrigin.get(h.id)!);
      const p = byId.get(s.id)!;
      for (const parent of [p.fatherId, p.motherId]) {
        const o = has(parent) ? householdOf.get(parent) : undefined;
        if (o && o !== h.id && !out.includes(o)) out.push(o);
      }
    }
    origins.set(h.id, out);
  }

  const sized = new Map(households.map((h) => [h.id, householdSize(h)]));
  const tree = layoutTree(
    households.map((h) => {
      const o = origins.get(h.id) ?? [];
      return { id: h.id, fatherId: o[0] ?? null, motherId: o[1] ?? null, spouseId: null, ...sized.get(h.id)! };
    }),
    anchorId && householdOf.has(anchorId) ? householdOf.get(anchorId)! : null,
    { unit: UNIT_GAP, row: ROW_GAP },
  );
  const at = new Map(tree.people.map((p) => [p.id, p]));
  const centreX = (id: string) => {
    const p = at.get(id);
    return p ? p.x + p.w / 2 : 0;
  };

  // ── the cards ───────────────────────────────────────────────────────────
  const placed: PlacedHousehold[] = [];
  const slotAt = new Map<string, PlacedSlot>();
  for (const h of households) {
    const box = at.get(h.id)!;
    let heads = h.heads;
    // A couple sits with each spouse on the side of the family they came
    // from, so the curves from the two families do not cross.
    if (heads.length === 2 && heads.every((s) => s.kind === "person")) {
      const from = heads.map((s) => {
        const p = byId.get(s.id)!;
        const o = [p.fatherId, p.motherId].filter(has).map((id) => householdOf.get(id)!).filter((id) => id !== h.id);
        return o.length ? centreX(o[0]) : null;
      });
      if (from[0] !== null && from[1] !== null ? from[0] > from[1] : from[0] !== null ? from[0] > box.x + box.w / 2 : from[1] !== null ? from[1] < box.x + box.w / 2 : false) {
        heads = [heads[1], heads[0]];
      }
    }
    const top = box.y + PAD + HEADER;
    const slots: PlacedSlot[] = [];
    const headX = box.x + (box.w - rowWidth(heads.length)) / 2;
    heads.forEach((s, i) => slots.push({ ...s, x: headX + i * (TILE_W + TILE_GAP), y: top, row: "head" }));
    h.kids.forEach((s, i) => {
      const row = Math.floor(i / KIDS_PER_ROW);
      const inRow = Math.min(KIDS_PER_ROW, h.kids.length - row * KIDS_PER_ROW);
      const x0 = box.x + (box.w - rowWidth(inRow)) / 2;
      slots.push({ ...s, x: x0 + (i % KIDS_PER_ROW) * (TILE_W + TILE_GAP), y: top + TILE_H + KID_GAP + row * (TILE_H + TILE_GAP), row: "kid" });
    });
    for (const s of slots) slotAt.set(s.id, s);
    placed.push({ ...h, heads, x: box.x, y: box.y, w: box.w, h: box.h, generation: box.generation, slots });
  }

  // ── lines inside a card ─────────────────────────────────────────────────
  // A couple is joined between their two photos, and the children at home
  // hang from the middle of that line -- the way every family tree has
  // always been drawn, only curved.
  const inner: Inner[] = [];
  const descentFrom = (h: PlacedHousehold) => {
    const hs = h.slots.filter((s) => s.row === "head");
    if (hs.length === 2) return { x: (hs[0].x + TILE_W + hs[1].x) / 2, y: hs[0].y + AVATAR / 2 };
    return { x: hs[0].x + TILE_W / 2, y: hs[0].y + TILE_H - 4 };
  };
  for (const h of placed) {
    const hs = h.slots.filter((s) => s.row === "head");
    const ghostCouple = hs.some((s) => s.kind !== "person");
    const firstRow = h.slots.filter((s) => s.row === "kid" && s.y === hs[0].y + TILE_H + KID_GAP);
    const from = descentFrom(h);
    // The children's lines start under the parents' names, not across them:
    // a couple's comes straight down the gap between the two names first.
    const fork = hs[0].y + TILE_H - 4;
    if (hs.length === 2) {
      const y = from.y;
      inner.push({
        household: h.id,
        d: `M${hs[0].x + TILE_W / 2 + AVATAR / 2 + 4},${y}H${hs[1].x + TILE_W / 2 - AVATAR / 2 - 4}${firstRow.length ? `M${from.x},${y}V${fork}` : ""}`,
        ghost: ghostCouple,
      });
    }
    for (const k of firstRow) {
      inner.push({ household: h.id, d: curve(from.x, fork, k.x + TILE_W / 2, k.y), ghost: ghostCouple || k.kind !== "person" });
    }
  }

  // ── curves between households ───────────────────────────────────────────
  // From the bottom of the card someone grew up in to the top of the card
  // they head now, ending over their photo. One curve per parent household
  // per person, so a couple whose two families are both recorded has two.
  const connectors: Connector[] = [];
  const hAt = new Map(placed.map((h) => [h.id, h]));
  const link = (fromId: string, toPerson: string, ghost: boolean) => {
    const from = hAt.get(fromId);
    const to = hAt.get(householdOf.get(toPerson) ?? "");
    const slot = slotAt.get(toPerson);
    if (!from || !to || !slot || from.id === to.id) return;
    const x1 = descentFrom(from).x;
    const y1 = from.y + from.h;
    const x2 = slot.x + TILE_W / 2;
    const y2 = to.y;
    if (y2 <= y1) return; // records that contradict themselves are not drawn
    if (connectors.some((c) => c.from === fromId && c.to === toPerson)) return;
    connectors.push({ from: fromId, to: toPerson, d: curve(x1, y1, x2, y2), ghost, end: { x: x2, y: y2 } });
  };
  for (const p of input) {
    for (const parent of [p.fatherId, p.motherId]) if (has(parent)) link(householdOf.get(parent)!, p.id, false);
  }
  for (const g of ghostLinks) link(g.from, g.to, true);

  return { households: placed, connectors, inner, width: tree.width, height: tree.height };
}
