import type { TodayEntry } from "@/components/today-list";

/** Today's list, collapsible (Janine, 21 October): what its heading says
 * when folded or open, and the cookie that keeps each person's choice on
 * this device (read on the server, so the page arrives already folded). */

export function todayCookieName(memberId: string): string {
  return `kin_today_open_${memberId}`;
}

export const TODAY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Answered for today: done, or skipped on purpose. */
function answered(e: TodayEntry): boolean {
  return e.kind === "task" ? !!e.task.today?.status : !!e.item.mark;
}

/** "3 of 8 done", and how many urgent ones are still open -- said even when
 * the list is folded, so nothing urgent hides behind it. */
export function todayCounts(entries: TodayEntry[]): { done: number; total: number; urgent: number } {
  return {
    done: entries.filter(answered).length,
    total: entries.length,
    urgent: entries.filter((e) => e.kind === "item" && e.item.urgent && !answered(e)).length,
  };
}

export function todaySummary(c: { done: number; total: number; urgent: number }): string {
  return `${c.done} of ${c.total} done${c.urgent > 0 ? ` · ${c.urgent} urgent` : ""}`;
}
