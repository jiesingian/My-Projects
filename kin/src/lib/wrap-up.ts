import type { TodayEntry } from "@/components/today-list";

/** The evening wrap-up on Today (roadmap item 2): from 6pm in the household's
 * zone, what got done today, what is still open, and the open plans that can
 * move to tomorrow in one tap.
 *
 * Built from Today's own list, so it can never disagree with it:
 *
 * - done: marked done today (today_marks), or a chore ticked today
 * - open: something Today offers to mark (Done, Pay, Shop) and nobody has --
 *   skipped things are neither, the person has already decided about them
 * - movable: only one-off plans (activities). A chore comes back tomorrow on
 *   its own, a bill keeps its due date, a check-up keeps its schedule.
 */

export const WRAP_UP_FROM = "18:00";

/** `clock` is the household's 24-hour wall clock, "HH:MM" (familyClock). */
export function isWrapUpTime(clock: string): boolean {
  return /^\d{2}:\d{2}$/.test(clock) && clock >= WRAP_UP_FROM;
}

export type WrapUp = { done: string[]; open: { title: string; activityId: string | null }[]; movable: string[] };

export function wrapUp(entries: TodayEntry[]): WrapUp {
  const done: string[] = [];
  const open: WrapUp["open"] = [];
  for (const e of entries) {
    if (e.kind === "task") {
      if (!e.task.today) continue;
      if (e.task.today.status === "done") done.push(e.task.title);
      else if (!e.task.today.status) open.push({ title: e.task.title, activityId: null });
      continue;
    }
    const { item } = e;
    if (item.mark === "done") done.push(item.title);
    else if (!item.mark && item.action) {
      const m = /^activity-([0-9a-f-]{36})$/.exec(item.id);
      open.push({ title: item.title, activityId: m ? m[1] : null });
    }
  }
  return { done, open, movable: open.flatMap((o) => (o.activityId ? [o.activityId] : [])) };
}
