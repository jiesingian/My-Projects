/** The family tree chart's geometry: where each person sits, the lines between
 * them, and the tinted regions behind real Kin households.
 *
 * The first redesign (#393, 30 September) grouped people into households it
 * made up from the tree -- "Arenas", "Singian" -- and coloured each by a hash.
 * Jonathan's verdict on the result: messy, the households "are not even
 * existing", and the colours "very random". So this draws people, one tile
 * each, the way every genealogy chart does, and only tints the households
 * that really exist on Kin: yours, and the linked households that have
 * confirmed a person on your tree as theirs. Everybody else is a name, and is
 * drawn as one.
 *
 * Two things the records leave out, handled here rather than by asking:
 *
 *  - Parents added one at a time ("Add father", then "Add mother") are never
 *    recorded as married to each other. Two people who share a child and have
 *    no spouse recorded are seated together as co-parents, with a dashed line
 *    instead of a married couple's solid one -- which is also exactly how an
 *    unmarried couple with a child should look.
 *  - A child with a different partner hangs from the two parents they
 *    actually share, not from the couple that happens to be seated together
 *    (layoutTree groups children by their exact pair of parents).
 *
 * Pure, for the specs: e2e/tree-chart.logic.spec.ts.
 */

import { layoutTree, type PlacedPerson } from "@/lib/tree-layout";

export type ChartNode = { id: string; fatherId: string | null; motherId: string | null; spouseId: string | null; ghost?: boolean };
/** A real household on Kin, and which people on the chart belong to it. */
export type HouseholdGroup = { id: string; memberIds: string[] };

export type Rect = { x: number; y: number; w: number; h: number };
export type Region = { group: string; rects: Rect[]; label: { x: number; y: number } };
export type CoupleLine = { a: string; b: string; d: string; married: boolean; ghost: boolean };
export type FamilyLine = { parentIds: string[]; childIds: string[]; d: string; ghost: boolean };
export type Chart = {
  people: PlacedPerson[];
  couples: CoupleLine[];
  families: FamilyLine[];
  regions: Region[];
  width: number;
  height: number;
};

// Sizes in px at the default text size; the chart draws them in rem.
export const TILE_W = 96;
export const TILE_H = 112;
export const AVATAR = 52;
const AVATAR_TOP = 4; // the tile's top padding
const ROW_GAP = 76;
const LANE = 10; // between two families' bars in the same gap
const UNIT_GAP = 24;
const MARGIN = 28; // room round the edge for the regions' padding and labels
const PAD = 10; // a region's padding round its people
const CORNER = 10;

/** Who sits beside whom: every recorded marriage, and, for anybody with no
 * spouse recorded, the other parent of their child. `married` holds the
 * pairs that are recorded as married, keyed "a|b" with the ids sorted. */
export function seatCouples(people: ChartNode[]): { partnerOf: Map<string, string>; married: Set<string> } {
  const byId = new Map(people.map((p) => [p.id, p]));
  const has = (id: string | null | undefined): id is string => !!id && byId.has(id);
  const partnerOf = new Map<string, string>();
  const married = new Set<string>();
  const key = (a: string, b: string) => [a, b].sort().join("|");
  for (const p of people) {
    if (!has(p.spouseId) || p.spouseId === p.id) continue;
    if (!partnerOf.has(p.id) && !partnerOf.has(p.spouseId)) {
      partnerOf.set(p.id, p.spouseId);
      partnerOf.set(p.spouseId, p.id);
      married.add(key(p.id, p.spouseId));
    }
  }
  for (const c of people) {
    const [f, m] = [c.fatherId, c.motherId];
    if (!has(f) || !has(m) || f === m || partnerOf.has(f) || partnerOf.has(m)) continue;
    partnerOf.set(f, m);
    partnerOf.set(m, f);
  }
  return { partnerOf, married };
}

/** Everybody related to `fromId` within `degree` degrees, counted the way
 * Philippine civil law counts them: one degree per generation up or down,
 * so parents and children are the first degree, and grandparents,
 * grandchildren, brothers and sisters the second. A marriage adds no degree
 * (relatives by affinity are counted as the spouse's own), so a spouse's
 * parents are also the first and their brothers and sisters the second.
 * The "close family" view of a big tree is the second degree (Jonathan,
 * 30 September). */
export function withinDegree(people: ChartNode[], fromId: string, degree: number): Set<string> {
  const byId = new Map(people.map((p) => [p.id, p]));
  const next = new Map<string, { id: string; cost: number }[]>();
  const link = (a: string, b: string, cost: number) => {
    next.set(a, [...(next.get(a) ?? []), { id: b, cost }]);
    next.set(b, [...(next.get(b) ?? []), { id: a, cost }]);
  };
  for (const p of people) {
    for (const parent of [p.fatherId, p.motherId]) if (parent && byId.has(parent) && parent !== p.id) link(p.id, parent, 1);
    if (p.spouseId && byId.has(p.spouseId) && p.spouseId !== p.id) link(p.id, p.spouseId, 0);
  }
  // Shortest distance with free marriages: a 0-1 breadth-first search. Only
  // one marriage is free on any one path, or a spouse's sibling's spouse's
  // family would all count as close.
  const best = new Map<string, number>();
  const key = (id: string, wed: boolean) => `${id}|${wed ? 1 : 0}`;
  const dist = new Map<string, number>();
  if (!byId.has(fromId)) return new Set();
  const deque: { id: string; wed: boolean; d: number }[] = [{ id: fromId, wed: false, d: 0 }];
  dist.set(key(fromId, false), 0);
  while (deque.length) {
    const { id, wed, d } = deque.shift()!;
    if (d > (dist.get(key(id, wed)) ?? Infinity)) continue;
    best.set(id, Math.min(best.get(id) ?? Infinity, d));
    for (const { id: o, cost } of next.get(id) ?? []) {
      if (cost === 0 && wed) continue;
      const nd = d + cost;
      const nw = wed || cost === 0;
      if (nd > degree || nd >= (dist.get(key(o, nw)) ?? Infinity)) continue;
      dist.set(key(o, nw), nd);
      if (cost === 0) deque.unshift({ id: o, wed: nw, d: nd });
      else deque.push({ id: o, wed: nw, d: nd });
    }
  }
  return new Set(best.keys());
}

/** A line from one or more parents down to their children: each drops to a
 * bar halfway between the rows, the bar runs across, and each child hangs
 * from it. Rounded where the bar turns at either end. */
function familyPath(sources: { x: number; y: number }[], childXs: number[], barY: number, childY: number): string {
  const xs = [...sources.map((s) => s.x), ...childXs];
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  if (xmax - xmin < 1) return `M${xmin},${Math.min(...sources.map((s) => s.y))}V${childY}`;
  const r = Math.min(CORNER, (xmax - xmin) / 2, (childY - barY) / 2);
  const at = (x: number, end: number) => Math.abs(x - end) < 0.5;
  const parts = [`M${xmin + r},${barY}H${xmax - r}`];
  for (const s of sources) {
    if (at(s.x, xmin)) parts.push(`M${s.x},${s.y}V${barY - r}Q${s.x},${barY} ${s.x + r},${barY}`);
    else if (at(s.x, xmax)) parts.push(`M${s.x},${s.y}V${barY - r}Q${s.x},${barY} ${s.x - r},${barY}`);
    else parts.push(`M${s.x},${s.y}V${barY}`);
  }
  for (const x of childXs) {
    if (at(x, xmin)) parts.push(`M${x + r},${barY}Q${x},${barY} ${x},${barY + r}V${childY}`);
    else if (at(x, xmax)) parts.push(`M${x - r},${barY}Q${x},${barY} ${x},${barY + r}V${childY}`);
    else parts.push(`M${x},${barY}V${childY}`);
  }
  return parts.join("");
}

export function buildChart(nodes: ChartNode[], anchorId: string | null, groups: HouseholdGroup[] = []): Chart {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const { partnerOf, married } = seatCouples(nodes);
  // The other parent of a child from another relationship sits on the far
  // side of the parent they share, so the child's line is short and crosses
  // nobody -- a father between his former partner and his wife.
  const partners = new Map<string, string[]>();
  for (const c of nodes) {
    const [f, m] = [c.fatherId, c.motherId];
    if (!f || !m || !byId.has(f) || !byId.has(m) || partnerOf.get(f) === m) continue;
    const seatedOne = partnerOf.has(f) && !partnerOf.has(m) ? f : partnerOf.has(m) && !partnerOf.has(f) ? m : null;
    if (!seatedOne) continue;
    const other = seatedOne === f ? m : f;
    partners.set(seatedOne, [...new Set([...(partners.get(seatedOne) ?? []), other])]);
  }
  const tree = layoutTree(
    nodes.map((n) => ({ id: n.id, fatherId: n.fatherId, motherId: n.motherId, spouseId: partnerOf.get(n.id) ?? null, partners: partners.get(n.id), w: TILE_W, h: TILE_H })),
    anchorId,
    { unit: UNIT_GAP, row: ROW_GAP },
  );
  const people = tree.people.map((p) => ({ ...p, x: p.x + MARGIN, y: p.y + MARGIN }));
  const at = new Map(people.map((p) => [p.id, p]));
  const centre = (id: string) => at.get(id)!.x + TILE_W / 2;
  const avatarY = (id: string) => at.get(id)!.y + AVATAR_TOP + AVATAR / 2;
  const isGhost = (id: string) => !!byId.get(id)?.ghost;

  // ── couples ─────────────────────────────────────────────────────────────
  // Joined between their two photos when they sit side by side: a solid line
  // if they are recorded as married, a dashed one if they are only the
  // parents of the same child -- unmarried, separated, or simply never
  // recorded as married.
  const couples: CoupleLine[] = [];
  const seated = new Set<string>();
  const beside = (a: string, b: string) => {
    const [pa, pb] = [at.get(a), at.get(b)];
    return !!pa && !!pb && pa.y === pb.y && Math.abs(Math.abs(pa.x - pb.x) - TILE_W) <= 19;
  };
  const pairs = [...partnerOf].map(([a, b]) => [a, b]);
  for (const n of nodes) if (n.fatherId && n.motherId) pairs.push([n.fatherId, n.motherId]);
  for (const [a, b] of pairs) {
    const key = [a, b].sort().join("|");
    if (seated.has(key) || !beside(a, b)) continue;
    seated.add(key);
    const [l, r] = at.get(a)!.x < at.get(b)!.x ? [a, b] : [b, a];
    const y = avatarY(l);
    couples.push({ a: l, b: r, d: `M${centre(l) + AVATAR / 2 + 3},${y}H${centre(r) - AVATAR / 2 - 3}`, married: married.has(key), ghost: isGhost(a) || isGhost(b) });
  }

  // ── parents to children ─────────────────────────────────────────────────
  // A seated couple's line comes down from the middle of theirs, between the
  // two names; a parent on their own, or two who are not seated together,
  // each drop from the bottom of their own tile.
  //
  // Two families whose bars would share a height and overlap along the same
  // stretch -- a father's children with his wife and with a former partner,
  // next to his in-laws' children -- read as one family, so overlapping bars
  // in the same gap are put on different lanes. And a dashed place to add a
  // brother or sister gets a dashed drop of its own, rather than turning the
  // whole family's line into a dashed one.
  type Spec = { parents: string[]; kids: string[]; sources: { x: number; y: number }[]; childY: number; ghost: boolean; lo: number; hi: number; lane: number };
  const specs: Spec[] = [];
  for (const f of tree.families) {
    const parents = f.parentIds.filter((id) => at.has(id));
    const allKids = f.childIds.filter((id) => at.has(id));
    if (!parents.length || !allKids.length) continue;
    const together = parents.length === 2 && seated.has([...parents].sort().join("|"));
    const sources = together
      ? [{ x: (centre(parents[0]) + centre(parents[1])) / 2, y: avatarY(parents[0]) }]
      : parents.map((id) => ({ x: centre(id), y: at.get(id)!.y + TILE_H }));
    const childY = Math.min(...allKids.map((id) => at.get(id)!.y));
    if (childY <= Math.max(...parents.map((id) => at.get(id)!.y))) continue;
    const parentGhost = parents.some(isGhost);
    const real = allKids.filter((id) => !isGhost(id));
    const ghostKids = allKids.filter(isGhost);
    for (const [kids, ghost] of [
      [ghostKids, true],
      [real, parentGhost],
    ] as const) {
      if (!kids.length) continue;
      const xs = [...sources.map((s) => s.x), ...kids.map(centre)];
      specs.push({ parents, kids, sources, childY, ghost, lo: Math.min(...xs), hi: Math.max(...xs), lane: 0 });
    }
  }
  const lanesIn = new Map<number, number>();
  for (const y of new Set(specs.map((s) => s.childY))) {
    const inGap = specs.filter((s) => s.childY === y).sort((a, b) => a.lo - b.lo);
    const ends: number[] = [];
    const placed = new Set<Spec>();
    for (const s of inGap) {
      // A family and its own dashed place share a lane: they are one family.
      const sibling = inGap.find((o) => o !== s && placed.has(o) && o.parents.join() === s.parents.join());
      let lane = sibling ? sibling.lane : ends.findIndex((end) => end < s.lo - 6);
      if (lane === -1) lane = ends.length;
      ends[lane] = Math.max(ends[lane] ?? -Infinity, s.hi);
      s.lane = lane;
      placed.add(s);
    }
    lanesIn.set(y, ends.length);
  }
  const families: FamilyLine[] = specs.map((s) => {
    const lanes = lanesIn.get(s.childY) ?? 1;
    const barY = s.childY - ROW_GAP / 2 + (s.lane - (lanes - 1) / 2) * LANE;
    return { parentIds: s.parents, childIds: s.kids, d: familyPath(s.sources, s.kids.map(centre), barY, s.childY), ghost: s.ghost };
  });

  // ── regions: the households that exist ──────────────────────────────────
  // One rounded box round the household's people: a couple and their
  // children read as a single shape (Jonathan: three joined boxes did not).
  // Only when somebody outside the household would land inside that box
  // does it fall back to one box per unbroken run along a row, joined to the
  // row below, so a region never swallows a relative who is not in it.
  const rows = [...new Set(people.map((p) => p.y))].sort((a, b) => a - b);
  const byRow = rows.map((y) => people.filter((p) => p.y === y).sort((a, b) => a.x - b.x));
  const regions: Region[] = [];
  for (const g of groups) {
    const members = new Set(g.memberIds.filter((id) => at.has(id)));
    if (!members.size) continue;
    const inside = people.filter((p) => members.has(p.id));
    const box: Rect = {
      x: Math.min(...inside.map((p) => p.x)) - PAD,
      y: Math.min(...inside.map((p) => p.y)) - PAD,
      w: Math.max(...inside.map((p) => p.x + TILE_W)) + PAD - (Math.min(...inside.map((p) => p.x)) - PAD),
      h: Math.max(...inside.map((p) => p.y + TILE_H)) + PAD - (Math.min(...inside.map((p) => p.y)) - PAD),
    };
    const intruder = people.some((p) => !members.has(p.id) && p.x < box.x + box.w && p.x + TILE_W > box.x && p.y < box.y + box.h && p.y + TILE_H > box.y);
    if (!intruder) {
      regions.push({ group: g.id, rects: [box], label: { x: box.x + 14, y: box.y } });
      continue;
    }
    const runs: { row: number; rect: Rect }[] = [];
    byRow.forEach((row, i) => {
      let start: PlacedPerson | null = null;
      let last: PlacedPerson | null = null;
      const close = () => {
        if (start && last) runs.push({ row: i, rect: { x: start.x - PAD, y: start.y - PAD, w: last.x + TILE_W - start.x + 2 * PAD, h: TILE_H + 2 * PAD } });
        start = last = null;
      };
      for (const p of row) {
        if (members.has(p.id)) {
          start ??= p;
          last = p;
        } else close();
      }
      close();
    });
    const rects = runs.map((r) => r.rect);
    for (const a of runs)
      for (const b of runs) {
        if (b.row !== a.row + 1) continue;
        // Overlapping both rows, so its rounded ends hide inside them and
        // the household reads as one shape rather than two joined by a neck.
        const x1 = Math.max(a.rect.x, b.rect.x);
        const x2 = Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w);
        if (x2 - x1 >= 40) rects.push({ x: x1, y: a.rect.y + a.rect.h - 24, w: x2 - x1, h: b.rect.y - (a.rect.y + a.rect.h) + 48 });
      }
    const top = runs.reduce((best, r) => (r.rect.y < best.rect.y || (r.rect.y === best.rect.y && r.rect.x < best.rect.x) ? r : best), runs[0]);
    regions.push({ group: g.id, rects, label: { x: top.rect.x + 12, y: top.rect.y } });
  }

  return { people, couples, families, regions, width: tree.width + 2 * MARGIN, height: tree.height + 2 * MARGIN };
}

/** The box round a set of people, for framing them in the window. */
export function boxAround(chart: Chart, ids: Set<string> | string[]): Rect | null {
  const want = new Set(ids);
  const ps = chart.people.filter((p) => want.has(p.id));
  if (!ps.length) return null;
  const x = Math.min(...ps.map((p) => p.x)) - PAD;
  const y = Math.min(...ps.map((p) => p.y)) - PAD - 14;
  return { x, y, w: Math.max(...ps.map((p) => p.x + TILE_W)) + PAD - x, h: Math.max(...ps.map((p) => p.y + TILE_H)) + PAD - y };
}
