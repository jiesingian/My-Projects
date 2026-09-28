/** Who a member is, in the household's terms.
 *
 * The database calls them 'parent', 'adult', 'child_managed' and
 * 'child_self' -- there is no role called 'child', and code that compares
 * against one silently means "never". That is not hypothetical: the chore
 * approval workflow shipped in #130 asked `me.role === "child"`, which no
 * member has ever been, so no tick ever waited for anybody.
 *
 * Two questions, asked here once, so the literals live in one place. */

export type MemberRole = "parent" | "adult" | "child_managed" | "child_self";

/** May decide things: set what a reward costs, answer a chore, grant a
 * redemption. */
export function isGrownUp(role: string): boolean {
  return role === "parent" || role === "adult";
}

/** A child, whether they have a login of their own (`child_self`) or a
 * grown-up keeps their profile for them (`child_managed`). */
export function isChild(role: string): boolean {
  return role === "child_managed" || role === "child_self";
}

/** A role as a person reads it. The database's names ("child_self",
 * "child_managed") showed through as "child self" and "child managed" on
 * Family and every profile (review, 28 September). */
export function roleLabel(role: string): string {
  switch (role) {
    case "parent":
      return "parent";
    case "adult":
      return "adult";
    case "child_self":
      return "child · own login";
    case "child_managed":
      return "child · kept by a parent";
    default:
      return role.replace(/_/g, " ");
  }
}
