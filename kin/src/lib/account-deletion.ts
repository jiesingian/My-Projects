/** Delete my account (Jonathan, 21 October): the rules the screens and the
 * logic spec read. The database decides the same things for itself
 * (20261021020000_delete_my_account.sql, account_handover_plan); this copy
 * exists so they can be tested without one. Pure. */

/** Days between asking and the account being removed; signing in during
 * them offers "Keep my account". */
export const DELETE_GRACE_DAYS = 7;

/** What the person types to confirm. Plain words, not the household name:
 * it is their account, not the household, that is being asked about. */
export const DELETE_CONFIRM_WORDS = "delete my account";

/** Typed close enough: case, outer spaces and repeated spaces don't matter. */
export function confirmMatches(typed: string): boolean {
  return typed.trim().replace(/\s+/g, " ").toLowerCase() === DELETE_CONFIRM_WORDS;
}

export type HandoverMember = {
  id: string;
  role: string;
  status: string;
  is_organiser: boolean;
  created_at: string;
  /** Their own account is waiting to be deleted too. */
  leaving?: boolean;
};

export type HandoverPlan = { kind: "none" } | { kind: "handover"; to_member: string } | { kind: "delete_household" };

const grownUp = (role: string) => role === "parent" || role === "adult";

/** What happens to the household when `leaving`'s account goes:
 * - not its organizer, or another grown-up organizer stays: nothing;
 * - otherwise the next active grown-up becomes organizer, a parent before
 *   an adult, then whoever joined first;
 * - no other active grown-up: the household is deleted (children's managed
 *   profiles go with it, as with Delete household; never on their own). */
export function handoverPlan(leaving: HandoverMember, household: HandoverMember[]): HandoverPlan {
  if (!leaving.is_organiser || !grownUp(leaving.role)) return { kind: "none" };
  const others = household.filter((m) => m.id !== leaving.id && m.status === "active" && grownUp(m.role) && !m.leaving);
  if (others.some((m) => m.is_organiser)) return { kind: "none" };
  const next = [...others].sort(
    (a, b) => Number(b.role === "parent") - Number(a.role === "parent") || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )[0];
  return next ? { kind: "handover", to_member: next.id } : { kind: "delete_household" };
}

/** The sentence the delete screen shows about the household. */
export function planSentence(plan: HandoverPlan, toName?: string | null): string | null {
  if (plan.kind === "handover") return `${toName || "Another grown-up"} will become the household's organizer.`;
  if (plan.kind === "delete_household")
    return "You're the household's only grown-up, so the household goes too, with everything in it, children's profiles included. Add another grown-up first to keep it.";
  return null;
}

/** The day the account will be removed, as people read it ("28 October"). */
export function deletionDay(deleteAfter: string, timeZone = "Asia/Manila"): string {
  return new Date(deleteAfter).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone });
}
