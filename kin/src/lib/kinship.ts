/** What somebody on the tree is to you: "Grandmother", "Cousin", "Sister-in-law".
 *
 * The tree records only father, mother and spouse, so a relationship is the
 * shortest walk between two people along those links -- up to a parent, down
 * to a child, across to a spouse -- read back as the word a family uses for it.
 * "up, down" is a brother or sister; "up, up, down" an aunt or uncle.
 *
 * Nobody's sex is recorded on the tree itself. It comes from a Kin profile
 * where there is one, and otherwise from the tree: whoever is somebody's
 * father is a man. Where neither says, the word is the neutral one ("Parent",
 * "Sibling") rather than a guess.
 *
 * Pure, for the specs: e2e/tree-chart.logic.spec.ts.
 */

export type KinPerson = { id: string; fatherId: string | null; motherId: string | null; spouseId: string | null; sex?: string | null };

type Sex = "m" | "f" | null;

// Each path the tree can take, and its word for a man, a woman, and anyone.
const WORDS: Record<string, [string, string, string]> = {
  S: ["Husband", "Wife", "Spouse"],
  U: ["Father", "Mother", "Parent"],
  UU: ["Grandfather", "Grandmother", "Grandparent"],
  UUU: ["Great-grandfather", "Great-grandmother", "Great-grandparent"],
  D: ["Son", "Daughter", "Child"],
  DD: ["Grandson", "Granddaughter", "Grandchild"],
  DDD: ["Great-grandson", "Great-granddaughter", "Great-grandchild"],
  UD: ["Brother", "Sister", "Sibling"],
  UUD: ["Uncle", "Aunt", "Aunt or uncle"],
  UUDS: ["Uncle", "Aunt", "Aunt or uncle"],
  UUUD: ["Great-uncle", "Great-aunt", "Great-aunt or uncle"],
  UUDD: ["Cousin", "Cousin", "Cousin"],
  UDD: ["Nephew", "Niece", "Niece or nephew"],
  SUDD: ["Nephew", "Niece", "Niece or nephew"],
  SU: ["Father-in-law", "Mother-in-law", "Parent-in-law"],
  DS: ["Son-in-law", "Daughter-in-law", "Child-in-law"],
  SUD: ["Brother-in-law", "Sister-in-law", "Sibling-in-law"],
  UDS: ["Brother-in-law", "Sister-in-law", "Sibling-in-law"],
  US: ["Stepfather", "Stepmother", "Step-parent"],
  SD: ["Stepson", "Stepdaughter", "Stepchild"],
  SUU: ["Grandfather-in-law", "Grandmother-in-law", "Grandparent-in-law"],
};

/** Every reachable person's relationship to `meId`, by id. "You" for them. */
export function relationships(people: KinPerson[], meId: string | null): Map<string, string> {
  const out = new Map<string, string>();
  const byId = new Map(people.map((p) => [p.id, p]));
  if (!meId || !byId.has(meId)) return out;
  const has = (id: string | null | undefined): id is string => !!id && byId.has(id);

  const sex = new Map<string, Sex>();
  for (const p of people) {
    if (has(p.fatherId)) sex.set(p.fatherId, "m");
    if (has(p.motherId)) sex.set(p.motherId, "f");
  }
  for (const p of people) {
    if (p.sex === "male") sex.set(p.id, "m");
    else if (p.sex === "female") sex.set(p.id, "f");
  }

  const spouses = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  for (const p of people) {
    if (has(p.spouseId) && p.spouseId !== p.id) {
      add(spouses, p.id, p.spouseId);
      add(spouses, p.spouseId, p.id);
    }
    for (const parent of [p.fatherId, p.motherId]) if (has(parent)) add(children, parent, p.id);
  }

  // Breadth first, so each person is reached by their shortest path. Parents
  // before children before spouses: of two equally short walks, the one
  // through blood wins, so a sister is "Sister" and not a step-something.
  const path = new Map<string, string>([[meId, ""]]);
  const queue = [meId];
  while (queue.length) {
    const id = queue.shift()!;
    const p = byId.get(id)!;
    const here = path.get(id)!;
    if (here.length >= 4) continue;
    const next: [string, string][] = [
      ...[p.fatherId, p.motherId].filter(has).map((x): [string, string] => [x, "U"]),
      ...(children.get(id) ?? []).map((x): [string, string] => [x, "D"]),
      ...(spouses.get(id) ?? []).map((x): [string, string] => [x, "S"]),
    ];
    for (const [other, step] of next) {
      if (path.has(other)) continue;
      path.set(other, here + step);
      queue.push(other);
    }
  }

  for (const [id, walk] of path) {
    if (id === meId) {
      out.set(id, "You");
      continue;
    }
    const words = WORDS[walk];
    if (!words) continue;
    const s = sex.get(id) ?? null;
    const word = s === "m" ? words[0] : s === "f" ? words[1] : words[2];
    // A brother or sister through one parent only -- a child of a father's
    // or mother's other partner -- is a half-brother or half-sister.
    const me = byId.get(meId)!;
    const them = byId.get(id)!;
    const mine = [me.fatherId, me.motherId].filter(has);
    const theirs = [them.fatherId, them.motherId].filter(has);
    const half = walk === "UD" && mine.length === 2 && theirs.length === 2 && mine.filter((x) => theirs.includes(x)).length === 1;
    out.set(id, half ? `Half-${word.toLowerCase()}` : word);
  }
  return out;
}
