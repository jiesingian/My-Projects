/** A membership nobody is in any more: removed by the household, or left for
 * a household of their own ("moved", kin/docs/PERSONAL_SPACE.md). Both stay in
 * the table so the household's history still says who wrote what, and both
 * are left out of every list of the people in it. */
export function isGone(status: string): boolean {
  return status === "removed" || status === "moved";
}

/** The same, for a PostgREST filter: `.not("status", "in", GONE_STATUSES)`. */
export const GONE_STATUSES = "(removed,moved)";
