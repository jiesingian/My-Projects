import { isForMe } from "@/lib/for-me";
import type { PlannerCalendarItem } from "@/lib/queries/planner";

/** Which of next week's plans the weekly digest shows a reader (pure, so the
 * rule can be tested). The same test as Today's lists (lib/for-me): theirs,
 * the whole family's, and for a grown-up the children's too -- never another
 * grown-up's own. Chores are left out, since they come round every week and
 * are not news. In kid view, bills are left out as well: a child's Kin says
 * nothing about money. */
export function nextWeekFor(
  items: PlannerCalendarItem[],
  me: { id: string; role: string },
  roleOf: (memberId: string) => string | undefined,
  kidView: boolean,
): PlannerCalendarItem[] {
  return items.filter((it) => {
    if (it.chore || it.table === "routines") return false;
    if (kidView && it.table === "bills") return false;
    return isForMe(me, it.appliesToAll, it.memberIds.map((id) => ({ id, role: roleOf(id) })));
  });
}
