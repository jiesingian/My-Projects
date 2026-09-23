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
