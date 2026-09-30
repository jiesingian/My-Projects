import type { BranchPerson } from "@/lib/queries/tree-links";

/** A person as the chart draws them, whichever household's record they are. */
export type ChartPerson = {
  id: string;
  fullName: string;
  birthYear: string | null;
  avatarUrl: string | null;
  memberId: string | null;
  fatherId: string | null;
  motherId: string | null;
  spouseId: string | null;
  /** From a Kin profile; never known for somebody from another household's branch. */
  color?: string | null;
  sex?: string | null;
  /** Set for somebody from a linked household's branch, drawn read-only. */
  fromHousehold: string | null;
};

/** Join a linked household's branch onto our tree.
 *
 * The shared person in the branch *is* one of ours, so they are not drawn a
 * second time: every link that pointed at them points at our person instead,
 * and the branch hangs off the right card. So does anybody else in the branch
 * already matched to one of our people -- `known` maps their ids to ours --
 * which is what stops Grandma appearing twice once both grandparents have
 * been matched.
 *
 * Branch ids are namespaced by match, so two branches can never collide with
 * each other or with ours. Pure, for the specs.
 */
export function mergeBranch(
  ours: ChartPerson[],
  branch: BranchPerson[],
  matchId: string,
  ourSharedPersonId: string,
  household: string,
  known: Map<string, string> = new Map(),
): ChartPerson[] {
  const shared = branch.find((b) => b.isSharedPerson);
  const toOurs = new Map(known);
  if (shared) toOurs.set(shared.id, ourSharedPersonId);
  const ourIds = new Set(ours.map((p) => p.id));
  const map = (id: string | null) => (id ? (toOurs.get(id) ?? `x:${matchId}:${id}`) : null);

  const added: ChartPerson[] = branch
    .filter((b) => !toOurs.has(b.id))
    .map((b) => ({
      id: map(b.id)!,
      fullName: b.fullName,
      birthYear: b.birthYear,
      avatarUrl: null,
      memberId: null,
      fatherId: map(b.fatherId),
      motherId: map(b.motherId),
      spouseId: map(b.spouseId),
      fromHousehold: household,
    }));

  // Our own people get parents from the branch only where we have none
  // recorded -- the branch fills gaps in our tree, it never overrules it.
  const fill = new Map<string, Partial<ChartPerson>>();
  for (const b of branch) {
    const ourId = toOurs.get(b.id);
    if (!ourId || !ourIds.has(ourId)) continue;
    fill.set(ourId, { fatherId: map(b.fatherId), motherId: map(b.motherId) });
  }
  const merged = ours.map((p) => {
    const f = fill.get(p.id);
    if (!f) return p;
    return { ...p, fatherId: p.fatherId ?? f.fatherId ?? null, motherId: p.motherId ?? f.motherId ?? null };
  });
  return [...merged, ...added];
}

const normal = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

/** Could two records be the same relative? The same first and last name, and
 * birth years that do not disagree. Middle names and initials are ignored,
 * because two households rarely type them the same way ("Stella M. Singian",
 * "Stella Singian"). */
export function sameName(a: { fullName: string; birthYear: string | null }, b: { fullName: string; birthYear: string | null }): boolean {
  if (a.birthYear && b.birthYear && a.birthYear !== b.birthYear) return false;
  const [x, y] = [normal(a.fullName), normal(b.fullName)];
  if (!x.length || !y.length) return false;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

/** Which people in a linked household's branch are ones we already have.
 *
 * Two households that each typed in the same grandmother have two records of
 * her, and nothing in either says so. Walking out from the one person both
 * households have confirmed, a relative in the same place on both trees --
 * the shared person's father, his wife, their child -- with the same name
 * is taken to be the same person, and drawn once. Only that walk: a matching
 * name somewhere else on the tree proves nothing, and a birth year that
 * disagrees always keeps them apart.
 *
 * For drawing only. It changes nobody's records; confirming a relative for
 * good is still a match the other household accepts. Pure, for the specs. */
export function matchBranch(ours: ChartPerson[], branch: BranchPerson[], ourSharedPersonId: string): Map<string, string> {
  const known = new Map<string, string>();
  const shared = branch.find((b) => b.isSharedPerson);
  const oursById = new Map(ours.map((p) => [p.id, p]));
  if (!shared || !oursById.has(ourSharedPersonId)) return known;
  const theirs = new Map(branch.map((b) => [b.id, b]));
  const taken = new Set<string>([ourSharedPersonId]);
  known.set(shared.id, ourSharedPersonId);
  const queue = [shared.id];
  const pair = (theirId: string | null, ourId: string | null) => {
    if (!theirId || !ourId || known.has(theirId) || taken.has(ourId)) return;
    const t = theirs.get(theirId);
    const o = oursById.get(ourId);
    if (!t || !o || o.fromHousehold || !sameName(t, o)) return;
    known.set(theirId, ourId);
    taken.add(ourId);
    queue.push(theirId);
  };
  const spouseOf = <T extends { id: string; spouseId: string | null }>(list: T[], id: string, own: string | null) => own ?? list.find((x) => x.spouseId === id)?.id ?? null;
  while (queue.length) {
    const tId = queue.shift()!;
    const t = theirs.get(tId)!;
    const o = oursById.get(known.get(tId)!)!;
    pair(t.fatherId, o.fatherId);
    pair(t.motherId, o.motherId);
    pair(spouseOf(branch, t.id, t.spouseId), spouseOf(ours, o.id, o.spouseId));
    const ourKids = ours.filter((p) => p.fatherId === o.id || p.motherId === o.id);
    for (const c of branch.filter((b) => b.fatherId === t.id || b.motherId === t.id)) {
      pair(c.id, ourKids.find((k) => !taken.has(k.id) && sameName(c, k))?.id ?? null);
    }
  }
  known.delete(shared.id); // mergeBranch maps the shared person itself
  return known;
}
