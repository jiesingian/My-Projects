/** Which "Visible to" choices a member can actually use.
 *
 * "Parents only" is not a softer setting that anyone may pick. Six row-level
 * policies -- on health_conditions, health_condition_entries, health_labs,
 * health_vitals, doc_entries and doc_files -- grant a `parents` row to
 * `current_member_role() = 'parent'` and to nobody else. Offering the option
 * to anyone else is not a smaller privilege, it is a dead end.
 *
 * Measured on 9 September against the throwaway household, as a member whose
 * role is `adult`:
 *
 *   visibility 'family',  asking for the row back   -> 201, saved
 *   visibility 'parents', asking for the row back   -> 403, NOTHING saved
 *   visibility 'parents', not asking for it back    -> 201, saved
 *
 * The middle line is what the app does: every create is
 * `.insert(...).select().single()`, which is `Prefer: return=representation`.
 * The insert itself is allowed -- it is the RETURNING that the SELECT policy
 * refuses, and a blocked RETURNING aborts the whole statement. So the row is
 * rolled back, the person is shown a raw Postgres string ("new row violates
 * row-level security policy for table \"health_conditions\""), and whatever
 * they typed is gone.
 *
 * Worth knowing who that is. `joinFamilyAction` hard-codes `p_role: "adult"`,
 * so every member who has ever joined by invite code is an adult, and only
 * the person who created the household is a parent. "Parents only" therefore
 * means "whoever set this household up" -- which is not what the label says,
 * and in the Singian household means it excludes both of the children's
 * parents but one.
 *
 * Narrowing the menu is the half that needs no decision about who may see
 * whose health records: it removes an option that could only ever fail. The
 * role model underneath it is a separate question and Jonathan's to answer.
 */

export const VISIBILITY_OPTIONS = [
  { value: "family", label: "Whole family" },
  { value: "parents", label: "Parents only" },
  { value: "private", label: "Just me" },
] as const;

export function visibilityOptions(role: string | null | undefined) {
  return VISIBILITY_OPTIONS.filter((o) => o.value !== "parents" || role === "parent");
}

/** Turn the policy's own words into something a person can act on.
 *
 * Reached only if a `parents` value arrives from somewhere the menu above
 * does not control -- an old tab, a replayed request, the assistant. The
 * refusal is correct and stays; what changes is that it stops being a
 * Postgres sentence about tables and policies. Any other error is passed
 * through untouched, because guessing at it would be worse than showing it.
 */
export function explainVisibilityRefusal(message: string): string {
  return /row-level security/i.test(message)
    ? "“Parents only” is limited to whoever set this household up, so this was not saved. Choose “Whole family” or “Just me” instead."
    : message;
}
