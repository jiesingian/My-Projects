/** Whether a new plan clashes with one already on the calendar (29 September).
 *
 * Janine: when scheduling, the Planner should say when a plan overlaps
 * another for the people it involves, and encourage changing it -- while a
 * birthday or other all-day event is only a reminder, and planning around it
 * that day stays possible.
 *
 * Two plans clash when their times overlap and they share someone. A plan
 * for the whole family (or for nobody in particular) involves everyone, so
 * it shares someone with every plan. Kept pure so it can be tested without a
 * request behind it; lib/queries/clashes.ts gathers the rows. */
export type ClashPlan = { start: number; end: number; wholeFamily: boolean; memberIds: string[] };

/** A plan with no end time is taken to last an hour. */
export const DEFAULT_MINUTES = 60;

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

export function sharesSomeone(a: ClashPlan, b: ClashPlan): boolean {
  const everyone = (p: ClashPlan) => p.wholeFamily || p.memberIds.length === 0;
  if (everyone(a) || everyone(b)) return true;
  return a.memberIds.some((id) => b.memberIds.includes(id));
}

export function clashes(a: ClashPlan, b: ClashPlan): boolean {
  return overlaps(a, b) && sharesSomeone(a, b);
}
