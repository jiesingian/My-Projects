import { isChild } from "@/lib/roles";

/** Seeding the household onto the family tree.
 *
 * The tree opened as "1 person" for a four-person household (21 October
 * audit): a parent had to add their own children by hand, and until they
 * did the tree looked broken. This plans, from the household's own member
 * list, what can be placed without anyone typing:
 *
 * - every active member who is not on the tree gets a row;
 * - the two members with the role "parent" are put down as spouses, if
 *   neither already has one. An "adult" (a lola in the house, a grown
 *   sibling) is placed but not linked: the role does not say who they are
 *   to anyone, and "nothing has to be recorded that isn't true"
 *   (docs/FAMILY_TREE.md);
 * - each child with no parent recorded gets the parents as father and
 *   mother, by sex where it is known; with neither known, the first parent
 *   is the father, as the chart's own form assumes.
 *
 * Pure: the action runs the plan, and the Tree tab shows it as a sentence
 * before anyone presses the button. */

export type SeedMember = { id: string; full_name: string; role: string; sex: string | null };
export type SeedPerson = { id: string; memberId: string | null; fatherId: string | null; motherId: string | null; spouseId: string | null };

export type SeedPlan = {
  /** Members to give a tree row, in member order. */
  insert: SeedMember[];
  /** The two parents to record as each other's spouse, by member id. */
  spouse: { a: SeedMember; b: SeedMember } | null;
  /** Children to link, by member id, to whichever parent slot fits. */
  children: { child: SeedMember; father: SeedMember | null; mother: SeedMember | null }[];
};

export function planHouseholdSeed(members: readonly SeedMember[], people: readonly SeedPerson[]): SeedPlan {
  const rowOf = new Map(people.filter((p) => p.memberId).map((p) => [p.memberId as string, p]));
  const insert = members.filter((m) => !rowOf.has(m.id));

  const parents = members.filter((m) => m.role === "parent");
  let spouse: SeedPlan["spouse"] = null;
  if (parents.length === 2) {
    const [a, b] = parents;
    const ra = rowOf.get(a.id);
    const rb = rowOf.get(b.id);
    // Already each other's, or nobody's: either way the plan may say so.
    // A spouse recorded elsewhere is somebody else's decision; leave it.
    const free = (r: SeedPerson | undefined, other: SeedPerson | undefined) => !r?.spouseId || (!!other && r.spouseId === other.id);
    const already = !!ra && !!rb && ra.spouseId === rb.id && rb.spouseId === ra.id;
    if (!already && free(ra, rb) && free(rb, ra)) spouse = { a, b };
  }

  // Father and mother slots, by sex where known.
  const slot = (p: SeedMember | undefined, other: SeedMember | undefined): "father" | "mother" | null => {
    if (!p) return null;
    if (p.sex === "male") return "father";
    if (p.sex === "female") return "mother";
    if (other?.sex === "male") return "mother";
    if (other?.sex === "female") return "father";
    return null;
  };
  let father: SeedMember | null = null;
  let mother: SeedMember | null = null;
  if (parents.length >= 1 && parents.length <= 2) {
    const [a, b] = parents;
    const sa = slot(a, b);
    const sb = slot(b, a);
    if (sa === "father" || (sa === null && sb !== "father")) father = a;
    if (sa === "mother" || (sa === null && sb === "father")) mother = a;
    if (b) {
      if (sb === "father" && !father) father = b;
      else if (sb === "mother" && !mother) mother = b;
      else if (sb === null) {
        if (!father) father = b;
        else if (!mother) mother = b;
      }
    }
  }

  const children = members
    .filter((m) => isChild(m.role))
    .filter((m) => {
      const r = rowOf.get(m.id);
      return !r || (!r.fatherId && !r.motherId);
    })
    .filter(() => father || mother)
    .map((child) => ({ child, father, mother }));

  return { insert, spouse, children };
}

export function seedPlanIsEmpty(plan: SeedPlan): boolean {
  return plan.insert.length === 0 && !plan.spouse && plan.children.length === 0;
}

const first = (m: SeedMember) => m.full_name.split(" ")[0];
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The plan as one sentence for the button's caption, from the viewer's
 * side: "Adds Pat, Robin and Alex; Pat as your spouse; Robin and Alex as
 * your children." */
export function describeSeedPlan(plan: SeedPlan, meId: string): string {
  const parts: string[] = [];
  const toAdd = plan.insert.filter((m) => m.id !== meId);
  if (plan.insert.some((m) => m.id === meId)) parts.push(toAdd.length ? `Adds you, ${list(toAdd.map(first))}` : "Adds you");
  else if (toAdd.length) parts.push(`Adds ${list(toAdd.map(first))}`);
  if (plan.spouse) {
    const other = plan.spouse.a.id === meId ? plan.spouse.b : plan.spouse.b.id === meId ? plan.spouse.a : null;
    parts.push(other ? `${first(other)} as your spouse` : `${first(plan.spouse.a)} and ${first(plan.spouse.b)} as spouses`);
  }
  if (plan.children.length) {
    const mine = plan.children.some((c) => c.father?.id === meId || c.mother?.id === meId);
    const kids = list(plan.children.map((c) => first(c.child)));
    parts.push(`${kids} as ${mine ? "your" : "their"} ${plan.children.length === 1 ? "child" : "children"}`);
  }
  return parts.length ? `${parts.join("; ")}.` : "";
}
