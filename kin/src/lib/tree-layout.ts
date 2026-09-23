/** Where everybody sits on the family tree chart.
 *
 * The tree is a graph -- father, mother and spouse links between people -- and
 * a chart needs coordinates. This is a small layered layout of the kind every
 * genealogy site uses: generations become rows, a couple sits side by side,
 * children hang below the middle of their parents, and nobody overlaps.
 *
 * Pure: people in, positions and connector geometry out. The chart component
 * only draws what this returns, so the placement rules can be tested without a
 * browser -- see e2e/tree-layout.logic.spec.ts.
 */

export type LayoutPerson = { id: string; fatherId: string | null; motherId: string | null; spouseId: string | null };

export const CARD_W = 150;
export const CARD_H = 66;
const COUPLE_GAP = 18; // between two spouses
const UNIT_GAP = 30; // between one family unit and the next
const ROW_GAP = 78; // between generations

export type PlacedPerson = { id: string; x: number; y: number; generation: number };
export type Couple = { a: string; b: string; y: number; x1: number; x2: number };
/** One set of children and the parent(s) they share, drawn as a line down
 * from the parents, a bar across, and a line down to each child. */
export type Family = { parentIds: string[]; childIds: string[]; fromX: number; fromY: number; barY: number; barX1: number; barX2: number; childXs: number[]; childY: number };

export type TreeLayout = { people: PlacedPerson[]; couples: Couple[]; families: Family[]; width: number; height: number };

export function layoutTree(input: LayoutPerson[], anchorId: string | null): TreeLayout {
  const byId = new Map(input.map((p) => [p.id, p]));
  // Links to anyone not in this list (removed, or another household's) are
  // dropped, so a dangling id can never place a card at undefined.
  const father = (p: LayoutPerson) => (p.fatherId && byId.has(p.fatherId) ? p.fatherId : null);
  const mother = (p: LayoutPerson) => (p.motherId && byId.has(p.motherId) ? p.motherId : null);

  // Spouses both ways: the column is one-directional, a marriage is not.
  const spouse = new Map<string, string>();
  for (const p of input) {
    if (p.spouseId && byId.has(p.spouseId) && p.spouseId !== p.id) {
      if (!spouse.has(p.id)) spouse.set(p.id, p.spouseId);
      if (!spouse.has(p.spouseId)) spouse.set(p.spouseId, p.id);
    }
  }
  const children = new Map<string, string[]>();
  for (const p of input) {
    for (const parent of [father(p), mother(p)]) {
      if (parent) children.set(parent, [...(children.get(parent) ?? []), p.id]);
    }
  }

  // ── generations ──────────────────────────────────────────────────────────
  // Breadth first from the anchor, then from anyone still unplaced (a branch
  // nobody has linked up yet). Parents one row up, children one down, spouses
  // level. Where the records disagree -- somebody entered as both a
  // grandparent and a cousin -- the first placement stands rather than the
  // layout looping.
  const gen = new Map<string, number>();
  const order: string[] = [];
  const seeds = [anchorId && byId.has(anchorId) ? anchorId : null, ...input.map((p) => p.id)].filter((v): v is string => !!v);
  for (const seed of seeds) {
    if (gen.has(seed)) continue;
    gen.set(seed, 0);
    const queue = [seed];
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      const g = gen.get(id)!;
      const p = byId.get(id)!;
      const next: [string | null | undefined, number][] = [
        [father(p), g - 1],
        [mother(p), g - 1],
        [spouse.get(id), g],
        ...(children.get(id) ?? []).map((c): [string, number] => [c, g + 1]),
      ];
      for (const [other, og] of next) {
        if (other && !gen.has(other)) {
          gen.set(other, og);
          queue.push(other);
        }
      }
    }
  }
  const minGen = Math.min(0, ...gen.values());
  for (const [id, g] of gen) gen.set(id, g - minGen);
  const rows = Math.max(0, ...gen.values()) + 1;

  // ── units: a couple, or one person ──────────────────────────────────────
  type Unit = { ids: string[]; gen: number; x: number };
  const unitOf = new Map<string, Unit>();
  const byRow: Unit[][] = Array.from({ length: rows }, () => []);
  for (const id of order) {
    if (unitOf.has(id)) continue;
    const s = spouse.get(id);
    const ids = s && !unitOf.has(s) && gen.get(s) === gen.get(id) ? [id, s] : [id];
    const unit: Unit = { ids, gen: gen.get(id)!, x: 0 };
    for (const m of ids) unitOf.set(m, unit);
    byRow[unit.gen].push(unit);
  }
  const unitWidth = (u: Unit) => u.ids.length * CARD_W + (u.ids.length - 1) * COUPLE_GAP;
  const centreOf = (id: string) => {
    const u = unitOf.get(id)!;
    return u.x + u.ids.indexOf(id) * (CARD_W + COUPLE_GAP) + CARD_W / 2;
  };
  const unitCentre = (u: Unit) => u.x + unitWidth(u) / 2;

  // Pack a row left to right, each unit at its wish or just clear of the
  // unit before it, whichever is further right. Order never changes here, so
  // nobody ever overlaps.
  const pack = (row: Unit[], wish: (u: Unit) => number | null) => {
    // null until the first unit is placed. It used to start at -Infinity,
    // which put a row's first unit with nothing to aim at at -Infinity too --
    // and every coordinate after it became NaN. The specs found it.
    let right: number | null = null;
    for (const u of row) {
      const w = wish(u);
      const want = w === null ? (right === null ? 0 : right + UNIT_GAP) : w - unitWidth(u) / 2;
      u.x = right === null ? want : Math.max(want, right + UNIT_GAP);
      right = u.x + unitWidth(u);
    }
  };
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const parentCentre = (u: Unit) => mean(u.ids.flatMap((id) => [father(byId.get(id)!), mother(byId.get(id)!)]).filter((v): v is string => !!v).map(centreOf));
  const childCentre = (u: Unit) => mean(u.ids.flatMap((id) => children.get(id) ?? []).map(centreOf));

  // Initial positions in discovery order, then a few sweeps: order each row by
  // where its parents are (going down) or its children are (going up), and
  // pull it towards them. Four sweeps settle every tree a household has.
  for (const row of byRow) pack(row, () => null);
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let g = 1; g < rows; g++) {
      byRow[g].sort((a, b) => (parentCentre(a) ?? unitCentre(a)) - (parentCentre(b) ?? unitCentre(b)));
      pack(byRow[g], parentCentre);
    }
    for (let g = rows - 2; g >= 0; g--) {
      byRow[g].sort((a, b) => (childCentre(a) ?? unitCentre(a)) - (childCentre(b) ?? unitCentre(b)));
      pack(byRow[g], childCentre);
    }
  }

  // Shift everything so the leftmost card sits at 0. The true minimum, not
  // min(x, 0): the sweeps only ever push units right, so a tree that drifted
  // right was left with an empty band down its left side and centred wrongly
  // -- found in the first screenshot of the chart, not by the specs.
  const allUnits = byRow.flat();
  const minX = allUnits.length ? Math.min(...allUnits.map((u) => u.x)) : 0;
  for (const u of allUnits) u.x -= minX;
  const rowY = (g: number) => g * (CARD_H + ROW_GAP);

  const people: PlacedPerson[] = [];
  for (const u of allUnits) u.ids.forEach((id, i) => people.push({ id, x: u.x + i * (CARD_W + COUPLE_GAP), y: rowY(u.gen), generation: u.gen }));

  const couples: Couple[] = allUnits
    .filter((u) => u.ids.length === 2)
    .map((u) => ({ a: u.ids[0], b: u.ids[1], y: rowY(u.gen) + CARD_H / 2, x1: u.x + CARD_W, x2: u.x + CARD_W + COUPLE_GAP }));

  // Children grouped by the exact pair of parents they share, so a
  // half-sibling hangs from the right parent rather than the whole couple.
  const groups = new Map<string, { parents: string[]; kids: string[] }>();
  for (const p of input) {
    const parents = [father(p), mother(p)].filter((v): v is string => !!v);
    if (!parents.length) continue;
    const key = [...parents].sort().join("+");
    const g = groups.get(key) ?? { parents, kids: [] };
    g.kids.push(p.id);
    groups.set(key, g);
  }
  const families: Family[] = [];
  for (const { parents, kids } of groups.values()) {
    const parentGen = Math.min(...parents.map((id) => gen.get(id)!));
    const childGen = Math.min(...kids.map((id) => gen.get(id)!));
    if (childGen <= parentGen) continue; // records that contradict themselves are not drawn as a family
    const fromX = mean(parents.map(centreOf))!;
    const childXs = kids.map(centreOf).sort((a, b) => a - b);
    // A two-parent family's line starts from the marriage line between them;
    // a single parent's from the bottom of their card.
    const fromY = parents.length === 2 && spouse.get(parents[0]) === parents[1] ? rowY(parentGen) + CARD_H / 2 : rowY(parentGen) + CARD_H;
    const childY = rowY(childGen);
    const barY = childY - ROW_GAP / 2;
    families.push({ parentIds: parents, childIds: kids, fromX, fromY, barY, barX1: Math.min(fromX, ...childXs), barX2: Math.max(fromX, ...childXs), childXs, childY });
  }

  const width = Math.max(CARD_W, ...allUnits.map((u) => u.x + unitWidth(u)));
  const height = rows * CARD_H + (rows - 1) * ROW_GAP;
  return { people, couples, families, width, height };
}
